// webhook_test.go proves the Paystack HMAC boundary: correct signature
// passes, everything else (wrong key, tampered body, garbage hex) fails —
// with the re-verification callback consulted only after a good signature.
package paystack

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

const testSecret = "sk_test_abcdef0123456789"

func sign(t *testing.T, body []byte, secret string) string {
	t.Helper()
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestVerifySignatureVector(t *testing.T) {
	body := []byte(`{"event":"charge.success"}`)
	sig := sign(t, body, testSecret)

	if !VerifySignature(body, testSecret, sig) {
		t.Error("correct signature must verify")
	}
	if VerifySignature(body, "sk_test_WRONG", sig) {
		t.Error("wrong secret must fail")
	}
	if VerifySignature([]byte(`{"event":"charge.success "}`), testSecret, sig) {
		t.Error("tampered body must fail")
	}
	if VerifySignature(body, testSecret, "not-hex-at-all") {
		t.Error("garbage signature must fail")
	}
	// Truncated-but-valid-hex signature (length oracle).
	if VerifySignature(body, testSecret, sig[:len(sig)-2]) {
		t.Error("truncated signature must fail")
	}
}

func TestWebhookHandlerRejectsBadSignature(t *testing.T) {
	h := WebhookHandler(testSecret, nil)
	body, _ := json.Marshal(Event{Event: "charge.success"})

	req := httptest.NewRequest(http.MethodPost, "/webhooks/paystack", bytes.NewReader(body))
	req.Header.Set(SignatureHeader, sign(t, body, "sk_test_attacker"))
	rec := httptest.NewRecorder()

	h(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestWebhookHandlerAcceptsAndReverifies(t *testing.T) {
	// The verify callback records whether it was consulted; a forged
	// "success" that never re-verifies must never count as paid.
	verifyCalled := false
	verify := func(ctx context.Context, ref string) (bool, error) {
		verifyCalled = true
		return true, nil
	}
	h := WebhookHandler(testSecret, verify)

	payload := map[string]any{
		"event": "charge.success",
		"data":  map[string]any{"reference": "GQ-TEST-1", "amount": 500000, "status": "success"},
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/paystack", bytes.NewReader(body))
	req.Header.Set(SignatureHeader, sign(t, body, testSecret))
	rec := httptest.NewRecorder()

	h(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if !verifyCalled {
		t.Fatal("charge.success must be re-verified against the API")
	}
}

func TestWebhookHandlerIgnoresOtherEvents(t *testing.T) {
	verifyCalled := false
	h := WebhookHandler(testSecret, func(context.Context, string) (bool, error) {
		verifyCalled = true
		return true, nil
	})

	payload := map[string]any{"event": "transfer.failed", "data": map[string]any{}}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/webhooks/paystack", bytes.NewReader(body))
	req.Header.Set(SignatureHeader, sign(t, body, testSecret))
	rec := httptest.NewRecorder()

	h(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if verifyCalled {
		t.Fatal("non-charge events must not trigger verification")
	}
}
