// Package paystack integrates Paystack for USD/card payments (global
// market counterpart to M-Pesa's KES rails).
//
// Two halves, like mpesa:
//   - client.go (this file): initialize a checkout session (Paystack
//     hosts the card form), verify a transaction when the user returns.
//   - webhook.go: the asynchronous, CRYPTOGRAPHICALLY SIGNED completion
//     event — unlike Daraja, Paystack signs webhooks with HMAC-SHA512,
//     which we verify in constant time before trusting anything.
//
// CONFIG: PAYSTACK_SECRET_KEY (sk_test_.../sk_live_...) enables the
// package; PAYSTACK_WEBHOOK_BASE is our public URL for callbacks.
package paystack

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client talks to Paystack's REST API.
type Client struct {
	http      *http.Client
	secretKey string
	baseURL   string
}

// New builds a client. baseURL defaults to Paystack's live API; tests
// override it.
func New(secretKey, baseURL string) *Client {
	if baseURL == "" {
		baseURL = "https://api.paystack.co"
	}
	return &Client{
		http:      &http.Client{Timeout: 15 * time.Second},
		secretKey: secretKey,
		baseURL:   baseURL,
	}
}

// InitializeTransaction creates a hosted checkout and returns the URL the
// client should be sent to (Paystack's card form). amount is in KOBO
// (Paystack's smallest unit — 100 kobo = 1 NGN; for USD subaccounts the
// same field is cents; keep the multiplier at the call site explicit).
func (c *Client) InitializeTransaction(ctx context.Context, email string, amountMinor int64, reference, callbackURL string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"email":        email,
		"amount":       amountMinor,
		"reference":    reference, // our idempotency key; we choose it
		"callback_url": callbackURL,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/transaction/initialize", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.secretKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("paystack: initialize: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("paystack: initialize: HTTP %d: %s", resp.StatusCode, string(raw))
	}

	var out struct {
		Status bool `json:"status"`
		Data   struct {
			AuthorizationURL string `json:"authorization_url"`
			Reference        string `json:"reference"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || !out.Status {
		return "", fmt.Errorf("paystack: initialize: bad response: %s", string(raw))
	}
	return out.Data.AuthorizationURL, nil
}

// VerifyTransaction asks Paystack directly whether a reference PAID.
// ALWAYS the source of truth before granting a tier: the webhook is a
// notification, verification is proof (a pattern Paystack's docs mandate
// to defeat forged client-side "success" redirects).
func (c *Client) VerifyTransaction(ctx context.Context, reference string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/transaction/verify/"+reference, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return false, fmt.Errorf("paystack: verify: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("paystack: verify: HTTP %d: %s", resp.StatusCode, string(raw))
	}

	var out struct {
		Data struct {
			Status string `json:"status"` // "success" | "failed" | "abandoned" | ...
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return false, fmt.Errorf("paystack: verify: decode: %w", err)
	}
	return out.Data.Status == "success", nil
}
