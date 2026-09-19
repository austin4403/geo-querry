// interceptor_test.go exercises the API-key gate: the happy path, both
// failure modes, and the disabled-when-empty contract that keeps local dev
// frictionless.
package auth

import (
	"net/http"
	"testing"

	"connectrpc.com/connect"
)

func headerWith(key string) http.Header {
	h := http.Header{}
	if key != "" {
		h.Set(APIKeyHeader, key)
	}
	return h
}

// mustVerify calls verify and fails the test if it unexpectedly errors.
func mustVerify(t *testing.T, ic connect.Interceptor, key string) {
	t.Helper()
	// The interceptor interface is what main.go receives; verify is
	// internal, so assert through the concrete type.
	gate := ic.(*interceptor)
	if err := gate.verify(headerWith(key)); err != nil {
		t.Fatalf("key %q should pass, got: %v", key, err)
	}
}

func TestGateDisabledWhenNoKeys(t *testing.T) {
	if NewAPIKeyInterceptor(nil) != nil {
		t.Fatal("empty key list must disable the gate (nil interceptor)")
	}
	if NewAPIKeyInterceptor([]string{}) != nil {
		t.Fatal("empty key list must disable the gate (nil interceptor)")
	}
}

func TestValidKeyPasses(t *testing.T) {
	ic := NewAPIKeyInterceptor([]string{"field-team-2026"})
	mustVerify(t, ic, "field-team-2026")
}

func TestAnyConfiguredKeyPasses(t *testing.T) {
	// Rotation story: old and new key both valid during a rollover window.
	ic := NewAPIKeyInterceptor([]string{"old-key", "new-key"})
	mustVerify(t, ic, "old-key")
	mustVerify(t, ic, "new-key")
}

func TestWrongKeyRejected(t *testing.T) {
	ic := NewAPIKeyInterceptor([]string{"field-team-2026"})
	gate := ic.(*interceptor)
	err := gate.verify(headerWith("wrong-key"))
	if err == nil {
		t.Fatal("wrong key must be rejected")
	}
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("want CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestMissingHeaderRejected(t *testing.T) {
	ic := NewAPIKeyInterceptor([]string{"field-team-2026"})
	gate := ic.(*interceptor)
	err := gate.verify(headerWith(""))
	if err == nil {
		t.Fatal("missing header must be rejected")
	}
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("want CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

// TestKeyLengthVariationRejected guards the constant-time property from a
// functional angle: keys sharing a prefix with a valid key (attacker
// probing how much of the key is right) must all fail identically.
func TestKeyLengthVariationRejected(t *testing.T) {
	ic := NewAPIKeyInterceptor([]string{"correct-horse-battery"})
	gate := ic.(*interceptor)
	for _, probe := range []string{
		"c", "co", "cor", "corr", "correct", "correct-horse", "correct-horse-batteryz",
		"correct-horse-battery-staple",
	} {
		if err := gate.verify(headerWith(probe)); err == nil {
			t.Fatalf("probe %q must be rejected", probe)
		}
	}
}
