// webhook_test.go covers Daraja callback parsing: amount extraction from
// the untyped metadata array, the paid/failed branches, and the
// secret-in-path gate (wrong token = 404, not 401 — no oracle).
package mpesa

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testToken = "whsec-0123456789abcdef"

// postCallback routes the request through a REAL ServeMux with the same
// pattern production mounts (POST /webhooks/mpesa/{secret}) — r.PathValue
// only populates through a mux, so testing the bare handler would bypass
// exactly the wiring we want to verify.
func postCallback(t *testing.T, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /webhooks/mpesa/{secret}", WebhookHandler(testToken))
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

const paidBody = `{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "29115-34620561-1",
      "CheckoutRequestID": "ws_CO_DMZ_12321_23423476",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": [
        {"Name": "Amount", "Value": 1500.0},
        {"Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV"},
        {"Name": "PhoneNumber", "Value": 254712345678}
      ]
    }
  }
}`

// TestPaidCallbackAcceptedAndParsed drives the real handler against a
// verbatim-shaped Daraja payload; the amounts log line is the audit trail
// (we assert the HTTP contract here — 200 + Daraja's ack JSON).
func TestPaidCallbackAcceptedAndParsed(t *testing.T) {
	var cb CallbackBody
	if err := json.Unmarshal([]byte(paidBody), &cb); err != nil {
		t.Fatalf("fixture must decode: %v", err)
	}
	if got := cb.Amount(); got != 1500.0 {
		t.Fatalf("Amount() = %v, want 1500", got)
	}

	rec := postCallback(t, "/webhooks/mpesa/"+testToken, paidBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"ResultCode":0`) {
		t.Fatalf("must ack with Daraja's expected shape, got %q", rec.Body.String())
	}
}

func TestFailedCallbackStillAcked(t *testing.T) {
	failed := strings.Replace(paidBody, `"ResultCode": 0`, `"ResultCode": 1032`, 1)
	rec := postCallback(t, "/webhooks/mpesa/"+testToken, failed)
	if rec.Code != http.StatusOK {
		t.Fatalf("failed payments must still be ACKed (else Safaricom retries), got %d", rec.Code)
	}
}

// TestWrongTokenIs404: the secret-path gate must answer identically to a
// nonexistent route — no oracle about what the endpoint is.
func TestWrongTokenIs404(t *testing.T) {
	rec := postCallback(t, "/webhooks/mpesa/wrong-token", paidBody)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("wrong token must 404, got %d", rec.Code)
	}
}

// TestMalformedPayloadsRejected without ever reaching business logic.
func TestMalformedPayloadsRejected(t *testing.T) {
	for name, body := range map[string]string{
		"not json":     `{oops`,
		"no checkout":  `{"Body":{"stkCallback":{"ResultCode":0}}}`,
		"empty object": `{}`,
	} {
		rec := postCallback(t, "/webhooks/mpesa/"+testToken, body)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: want 400, got %d", name, rec.Code)
		}
	}
}
