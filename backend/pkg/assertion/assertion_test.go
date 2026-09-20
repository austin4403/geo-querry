package assertion

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"testing"
	"time"
)

func generateKeyPair(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate ed25519 key pair: %v", err)
	}
	return pub, priv
}

func TestAssertionHappyPath(t *testing.T) {
	pub, priv := generateKeyPair(t)
	keyID := "key-2026-09"
	ring := NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	now := time.Now().UTC()
	claims := Claims{
		Subject:        "user-uuid-12345",
		AuthTime:       now.Add(-10 * time.Minute).Unix(),
		AuthMethodRefs: []string{"pwd", "totp"},
		SudoExpiresAt:  now.Add(15 * time.Minute).Unix(),
	}

	token, err := Sign(claims, priv, keyID)
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	verified, err := verifier.Verify(token, now)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	if verified.Subject != claims.Subject {
		t.Errorf("expected subject %s, got %s", claims.Subject, verified.Subject)
	}
	if !verified.HasActiveSudo(now) {
		t.Errorf("expected sudo to be active")
	}
	if verified.HasActiveSudo(now.Add(20 * time.Minute)) {
		t.Errorf("expected sudo to be expired in 20 minutes")
	}
}

func TestAssertionSignatureForgery(t *testing.T) {
	pub, _ := generateKeyPair(t)
	_, attackerPriv := generateKeyPair(t)
	keyID := "key-2026-09"
	ring := NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	now := time.Now().UTC()
	claims := Claims{Subject: "victim-user"}

	// Signed with attacker's private key claiming to be key-2026-09
	forgedToken, err := Sign(claims, attackerPriv, keyID)
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	_, err = verifier.Verify(forgedToken, now)
	if err == nil {
		t.Fatalf("expected signature verification failure, got nil")
	}
}

func TestAssertionUnknownKeyID(t *testing.T) {
	pub, priv := generateKeyPair(t)
	ring := NewKeyRing(map[string]ed25519.PublicKey{"legit-key": pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	now := time.Now().UTC()
	token, err := Sign(Claims{Subject: "user-123"}, priv, "unknown-key")
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	_, err = verifier.Verify(token, now)
	if err != ErrUnknownKeyID {
		t.Fatalf("expected ErrUnknownKeyID, got %v", err)
	}
}

func TestAssertionExpired(t *testing.T) {
	pub, priv := generateKeyPair(t)
	keyID := "key-1"
	ring := NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	now := time.Now().UTC()
	claims := Claims{
		Subject:   "user-123",
		IssuedAt:  now.Add(-10 * time.Minute).Unix(),
		NotBefore: now.Add(-10 * time.Minute).Unix(),
		ExpiresAt: now.Add(-5 * time.Minute).Unix(),
	}

	token, err := Sign(claims, priv, keyID)
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	_, err = verifier.Verify(token, now)
	if err != ErrExpired {
		t.Fatalf("expected ErrExpired, got %v", err)
	}
}

func TestAssertionPremature(t *testing.T) {
	pub, priv := generateKeyPair(t)
	keyID := "key-1"
	ring := NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	now := time.Now().UTC()
	claims := Claims{
		Subject:   "user-123",
		IssuedAt:  now.Add(10 * time.Minute).Unix(),
		NotBefore: now.Add(10 * time.Minute).Unix(),
		ExpiresAt: now.Add(15 * time.Minute).Unix(),
	}

	token, err := Sign(claims, priv, keyID)
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	_, err = verifier.Verify(token, now)
	if err != ErrPremature {
		t.Fatalf("expected ErrPremature, got %v", err)
	}
}

func TestAssertionExcessiveLifetime(t *testing.T) {
	pub, priv := generateKeyPair(t)
	keyID := "key-1"
	ring := NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	now := time.Now().UTC()
	claims := Claims{
		Subject:   "user-123",
		IssuedAt:  now.Unix(),
		NotBefore: now.Unix(),
		ExpiresAt: now.Add(1 * time.Hour).Unix(), // 1 hour > 300s
	}

	token, err := Sign(claims, priv, keyID)
	if err != nil {
		t.Fatalf("Sign failed: %v", err)
	}

	_, err = verifier.Verify(token, now)
	if err != ErrExcessiveLifetime {
		t.Fatalf("expected ErrExcessiveLifetime, got %v", err)
	}
}

func TestAssertionRejectsForbiddenClaims(t *testing.T) {
	pub, priv := generateKeyPair(t)
	keyID := "key-1"
	ring := NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	now := time.Now().UTC()

	// Manually construct token containing forbidden "role" claim
	headerJSON := `{"alg":"Ed25519","kid":"key-1","typ":"GEO-ASSERTION"}`
	claimsJSON := fmt.Sprintf(`{"iss":"geoquerry-web-bff","aud":"geoquerry-core-backend","sub":"user-1","iat":%d,"exp":%d,"nbf":%d,"role":"owner"}`,
		now.Unix(), now.Add(200*time.Second).Unix(), now.Unix())

	headerB64 := base64.RawURLEncoding.EncodeToString([]byte(headerJSON))
	claimsB64 := base64.RawURLEncoding.EncodeToString([]byte(claimsJSON))
	signingInput := headerB64 + "." + claimsB64
	sig := ed25519.Sign(priv, []byte(signingInput))
	token := signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)

	_, err := verifier.Verify(token, now)
	if err == nil || !strings.Contains(err.Error(), "prohibited") {
		t.Fatalf("expected ErrForbiddenClaimsFound, got %v", err)
	}
}
