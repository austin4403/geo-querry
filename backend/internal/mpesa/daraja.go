// Package mpesa integrates Safaricom Daraja (Lipa Na M-Pesa Online, aka
// STK Push) for KES subscriptions in the Kenyan market.
//
// HOW STK PUSH WORKS
//  1. Our server asks Daraja to push a payment prompt to a phone
//     (STKPush below) — the user's screen shows the familiar "Enter M-Pesa
//     PIN" dialog with our amount.
//  2. Safaricom confirms with the user out-of-band (their PIN) and then
//     calls OUR callback URL (the webhook in webhook.go) with the result.
//  3. The webhook verifies, records the outcome, and replies ResultCode 0
//     so Safaricom stops retrying.
//
// CONFIG (all env, all optional — the package is inert until MPESA_ENV is
// set): MPESA_ENV=sandbox|production, MPESA_CONSUMER_KEY,
// MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY,
// MPESA_WEBHOOK_SECRET (shared-secret path token, see webhook.go).
package mpesa

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// darajaBaseURLs: sandbox vs production hosts. Sandbox is free for
// development with Safaricom's test credentials.
var darajaBaseURLs = map[string]string{
	"sandbox":    "https://sandbox.safaricom.co.ke",
	"production": "https://api.safaricom.co.ke",
}

// Client talks to Daraja. Construct once (New); the OAuth token is cached
// and refreshed ahead of expiry so STK pushes stay on the hot path fast.
type Client struct {
	http           *http.Client
	baseURL        string
	shortcode      string
	passkey        string
	consumerKey    string
	consumerSecret string
	callbackBase   string // public base URL Safaricom should call back, e.g. https://api.geoquerry.io

	// tokenMu guards the cached token below; STK pushes can be concurrent.
	tokenMu     sync.Mutex
	token       string
	tokenExpiry time.Time
}

// New builds a client. env must be "sandbox" or "production".
func New(env, shortcode, passkey, consumerKey, consumerSecret, callbackBase string) *Client {
	base := darajaBaseURLs["production"]
	if env == "sandbox" {
		base = darajaBaseURLs["sandbox"]
	}
	return &Client{
		http:           &http.Client{Timeout: 15 * time.Second},
		baseURL:        base,
		shortcode:      shortcode,
		passkey:        passkey,
		consumerKey:    consumerKey,
		consumerSecret: consumerSecret,
		callbackBase:   callbackBase,
	}
}

// STKPushResult is what Daraja answers IMMEDIATELY (before the user has
// even entered their PIN): the request was accepted, not completed. The
// authoritative result arrives later via the webhook.
type STKPushResult struct {
	CheckoutRequestID string // correlates the later webhook callback to this push
	MerchantRequestID string
	CustomerMessage   string
}

// STKPush triggers the payment prompt on the user's phone.
// phone: format 2547XXXXXXXX. amountKES: whole shillings. accountRef:
// short reference shown on the M-Pesa statement (e.g. an invoice id).
// desc: what the user sees under the amount.
func (c *Client) STKPush(ctx context.Context, phone string, amountKES int64, accountRef, desc string) (*STKPushResult, error) {
	token, err := c.accessToken(ctx)
	if err != nil {
		return nil, err
	}

	// Daraja's password recipe: base64(shortcode + passkey + timestamp),
	// timestamp in yyyyMMddHHmmss (Safaricom's own format, UTC+3-agnostic).
	ts := time.Now().Format("20060102150405")
	password := base64.StdEncoding.EncodeToString([]byte(c.shortcode + c.passkey + ts))

	body := map[string]any{
		"BusinessShortCode": c.shortcode,
		"Password":          password,
		"Timestamp":         ts,
		"TransactionType":   "CustomerPayBillOnline",
		"Amount":            amountKES,
		"PartyA":            phone,
		"PartyB":            c.shortcode,
		"PhoneNumber":       phone,
		"CallBackURL":       c.callbackBase + "/webhooks/mpesa",
		"AccountReference":  accountRef,
		"TransactionDesc":   desc,
	}
	payload, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/mpesa/stkpush/v1/processrequest", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mpesa: stk push: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mpesa: stk push: HTTP %d: %s", resp.StatusCode, string(raw))
	}

	var accepted struct {
		STKPushResult
		ErrorMessage string `json:"errorMessage"`
	}
	if err := json.Unmarshal(raw, &accepted); err != nil {
		return nil, fmt.Errorf("mpesa: decode stk response: %w", err)
	}
	if accepted.ErrorMessage != "" {
		return nil, fmt.Errorf("mpesa: stk push rejected: %s", accepted.ErrorMessage)
	}
	return &accepted.STKPushResult, nil
}

// accessToken fetches and caches the OAuth token (valid ~1h; we refresh
// 2 minutes early). Double-checked under the mutex so concurrent pushes
// share one fetch.
func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExpiry) {
		return c.token, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/oauth/v1/generate?grant_type=client_credentials", nil)
	if err != nil {
		return "", err
	}
	// Daraja OAuth uses HTTP Basic auth with the consumer key:secret pair.
	req.SetBasicAuth(c.consumerKey, c.consumerSecret)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("mpesa: oauth: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
		return "", fmt.Errorf("mpesa: oauth: HTTP %d: %s", resp.StatusCode, string(raw))
	}

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   string `json:"expires_in"` // seconds, as a STRING (Daraja quirk)
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("mpesa: decode oauth: %w", err)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("mpesa: oauth returned no token")
	}

	var secs int
	// Daraja ships expires_in as a STRING of seconds. A malformed value
	// must not silently produce a zero/negative lifetime token — fall back
	// to Daraja's documented ~1h default instead.
	if parsed, err := strconv.Atoi(strings.TrimSpace(tok.ExpiresIn)); err == nil && parsed > 0 {
		secs = parsed
	} else {
		secs = 3599
	}
	c.token = tok.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(secs)*time.Second - 2*time.Minute)
	return c.token, nil
}
