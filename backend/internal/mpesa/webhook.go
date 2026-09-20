// webhook.go receives Safaricom's asynchronous STK push results.
//
// AUTHENTICATION MODEL (honest about the constraint)
// Daraja does NOT sign its C2B/STK callbacks — no HMAC, no JWT. The
// platform's own guidance is: use HTTPS + keep the callback URL secret.
// We do one better than a bare secret URL: the mount path embeds a
// high-entropy token (MPESA_WEBHOOK_SECRET) chosen at deploy time:
//
//	POST /webhooks/mpesa/{secret}
//
// A caller without the token gets a plain 404 — they cannot even tell an
// endpoint exists. Combined with TLS at the edge and body caps, this is a
// reasonable v1; when Safaricom ships signature headers, add them here.
//
// IDEMPOTENCY: Safaricom retries callbacks on failure, so the same
// CheckoutRequestID may arrive twice. ProcessPayment must be idempotent —
// the store phase (when wired to billing records) will key on it.
package mpesa

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
)

// CallbackBody is the subset of Daraja's callback we act on. Field names
// follow Daraja's PascalCase JSON exactly.
type CallbackBody struct {
	Body struct {
		StkCallback struct {
			MerchantRequestID string `json:"MerchantRequestID"`
			CheckoutRequestID string `json:"CheckoutRequestID"`
			ResultCode        int    `json:"ResultCode"` // 0 = paid, anything else = failed
			ResultDesc        string `json:"ResultDesc"`
			CallbackMetadata  []struct {
				Name  string `json:"Name"`
				Value any    `json:"Value"`
			} `json:"CallbackMetadata"`
		} `json:"stkCallback"`
	} `json:"Body"`
}

// Amount extracts the paid amount from CallbackMetadata (Daraja ships it
// as an untyped array — Name:"Amount", Value: 1.0). Returns 0 when absent.
func (cb *CallbackBody) Amount() float64 {
	for _, item := range cb.Body.StkCallback.CallbackMetadata {
		if item.Name == "Amount" {
			if f, ok := item.Value.(float64); ok {
				return f
			}
		}
	}
	return 0
}

// WebhookHandler validates and records one Safaricom callback.
// secret is the MPESA_WEBHOOK_SECRET; requests that don't carry it in the
// path simply 404.
func WebhookHandler(secret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Path shape: /webhooks/mpesa/{secret}. http.ServeMux passes the
		// matched wildcard via PathValue on Go 1.22+.
		if r.PathValue("secret") != secret {
			http.NotFound(w, r)
			return
		}

		// Cap the body: callbacks are small JSON; anything huge is hostile.
		var cb CallbackBody
		dec := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
		if err := dec.Decode(&cb); err != nil {
			log.Printf("mpesa webhook: bad payload: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		sc := cb.Body.StkCallback
		if sc.CheckoutRequestID == "" {
			log.Printf("mpesa webhook: payload missing CheckoutRequestID")
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		if sc.ResultCode == 0 {
			// PAID. Billing integration lands in the billing milestone:
			// record (CheckoutRequestID, Amount) against the account,
			// keyed idempotently. For now the audit trail is the log.
			log.Printf("mpesa webhook: PAID checkout=%s amount=%.0f KES ref=%s",
				sc.CheckoutRequestID, cb.Amount(), sc.MerchantRequestID)
		} else {
			log.Printf("mpesa webhook: FAILED checkout=%s code=%d desc=%s",
				sc.CheckoutRequestID, sc.ResultCode, sc.ResultDesc)
		}

		// Daraja's contract: acknowledge with this exact JSON or it retries.
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ResultCode":0,"ResultDesc":"Accepted"}`))
	}
}
