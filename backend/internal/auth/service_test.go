package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"testing"
	"time"

	"connectrpc.com/connect"

	"gitlab.com/austin4403/geoquerry/backend/pkg/assertion"
	geoquerryv1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

func TestAuthServiceExchangeAssertion(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	keyID := "bff-key-1"
	ring := assertion.NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := assertion.NewVerifier(ring, assertion.DefaultIssuer, assertion.DefaultAudience)

	svc := NewService(nil, verifier)

	now := time.Now().UTC()
	claims := assertion.Claims{
		Subject:  "usr-geo-999",
		AuthTime: now.Unix(),
	}

	tok, err := assertion.Sign(claims, priv, keyID)
	if err != nil {
		t.Fatalf("Sign assertion: %v", err)
	}

	req := connect.NewRequest(&geoquerryv1.ExchangeAssertionRequest{
		InternalAssertion: tok,
	})

	res, err := svc.ExchangeAssertion(context.Background(), req)
	if err != nil {
		t.Fatalf("ExchangeAssertion failed: %v", err)
	}

	if res.Msg.User.UserId != "usr-geo-999" {
		t.Errorf("expected user id usr-geo-999, got %s", res.Msg.User.UserId)
	}
}

func TestAuthServiceVerifySudo(t *testing.T) {
	svc := NewService(nil, nil)
	ctx := context.Background()

	// Unauthenticated should fail
	req := connect.NewRequest(&geoquerryv1.VerifySudoRequest{Password: "secret"})
	_, err := svc.VerifySudo(ctx, req)
	if err == nil {
		t.Fatalf("expected unauthenticated error, got nil")
	}

	// Authenticated
	ident := &Identity{
		UserID:  "user-1",
		Subject: "user-1",
	}
	ctx = WithIdentity(ctx, ident)

	res, err := svc.VerifySudo(ctx, req)
	if err != nil {
		t.Fatalf("VerifySudo failed: %v", err)
	}

	if !res.Msg.Success || res.Msg.SudoExpiresAt <= time.Now().Unix() {
		t.Fatalf("expected valid sudo elevation timestamp")
	}
}
