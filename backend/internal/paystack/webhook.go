// webhook.go receives Paystack's signed charge.success events.
//
// AUTHENTICATION MODEL (the strong one)
// Paystack signs the ENTIRE raw request body with HMAC-SHA512 using the
// account's secret key and ships the hex digest in the
// x-paystack-signature header. Verification therefore happens on the RAW
// bytes BEFORE any JSON parsing — re-serializing JSON would produce a
// different byte stream and break the signature.
//
// The comparison is constant-time (hmac.Equal) so an attacker cannot
// byte-by-byte forge a signature through timing.
package paystack

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
)

// SignatureHeader is the header Paystack sends the HMAC in.
const SignatureHeader = "x-paystack-signature"

// Event is the subset of Paystack's event payload we act on.
type Event struct {
	Event string `json:"event"` // "charge.success", "transfer.*", ...
	Data  struct {
		Reference string `json:"reference"`
		Amount    int64  `json:"amount"` // minor units (kobo/cents)
		Status    string `json:"status"`
	} `json:"data"`
}

// VerifySignature checks an inbound webhook request in constant time.
// Exported so tests (and future re-use) can exercise it directly.
func VerifySignature(rawBody []byte, secretKey, hexSignature string) bool {
	mac := hmac.New(sha512.New, []byte(secretKey))
	mac.Write(rawBody)
	expected := mac.Sum(nil)

	got, err := hex.DecodeString(hexSignature)
	if err != nil {
		return false
	}
	// hmac.Equal is the constant-time comparator for exactly this.
	return hmac.Equal(got, expected)
}

// WebhookHandler verifies, parses, and records one Paystack event.
func WebhookHandler(secretKey string, verify func(ctx context.Context, reference string) (bool, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1) Read raw body FIRST (signature is over raw bytes), capped at
		// 64 KB — webhook payloads are small; anything bigger is hostile.
		raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// 2) Verify BEFORE parsing: an unsigned/missigned request never
		// reaches business logic, and gets a bland 401 (no oracle about
		// what was wrong).
		if !VerifySignature(raw, secretKey, r.Header.Get(SignatureHeader)) {
			// RemoteAddr is the kernel-derived ip:port of the TCP peer —
			// not attacker-writable text — so no injection path exists
			// (gosec G706 cannot know that).
			log.Printf("paystack webhook: REJECTED bad signature from %s", r.RemoteAddr) // #nosec G706 -- RemoteAddr is kernel-derived ip:port
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		// 3) Parse the verified bytes.
		var ev Event
		if err := json.Unmarshal(raw, &ev); err != nil {
			log.Printf("paystack webhook: bad json: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// 4) Only completion events matter. And even for them, the webhook
		// is a HINT: before granting any tier, re-verify with the API
		// (Paystack's own guidance — webhooks can arrive out of order or
		// be replayed across events that share amounts).
		if ev.Event == "charge.success" {
			paid := false
			if verify != nil {
				paid, err = verify(r.Context(), ev.Data.Reference)
				if err != nil {
					// Network hiccup talking to Paystack: 500 makes them
					// retry later rather than silently losing the event.
					log.Printf("paystack webhook: re-verify failed for %s: %v",
						ev.Data.Reference, err)
					w.WriteHeader(http.StatusInternalServerError)
					return
				}
			}
			log.Printf("paystack webhook: charge ref=%s amount=%d verified_paid=%v",
				ev.Data.Reference, ev.Data.Amount, paid)
			// Tier provisioning lands with the billing milestone; the
			// verified reference is the idempotency key for that write.
		}

		// Paystack expects a quick 200 to stop retries.
		w.WriteHeader(http.StatusOK)
	}
}
