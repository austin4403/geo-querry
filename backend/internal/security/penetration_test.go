package security_test

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"testing"
	"time"

	"connectrpc.com/connect"
	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	"gitlab.com/austin4403/geoquerry/backend/internal/gis"
	"gitlab.com/austin4403/geoquerry/backend/internal/tenant"
	"gitlab.com/austin4403/geoquerry/backend/pkg/assertion"
	geoquerryv1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// Helper to generate test ed25519 key pairs.
func newKeyPair(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate ed25519 key: %v", err)
	}
	return pub, priv
}

// -----------------------------------------------------------------------
// 1. Adversarial Cryptographic & Assertion Penetration Tests
// -----------------------------------------------------------------------

func TestAdversarial_SignatureForgery(t *testing.T) {
	legitPub, _ := newKeyPair(t)
	_, attackerPriv := newKeyPair(t)

	keyID := "key-production-01"
	ring := assertion.NewKeyRing(map[string]ed25519.PublicKey{keyID: legitPub})
	verifier := assertion.NewVerifier(ring, assertion.DefaultIssuer, assertion.DefaultAudience)
	authSvc := auth.NewService(nil, verifier)

	// Attacker attempts to forge an assertion token for a privileged user
	claims := assertion.Claims{
		Subject: "usr_victim_admin",
	}
	forgedToken, err := assertion.Sign(claims, attackerPriv, keyID)
	if err != nil {
		t.Fatalf("failed to sign forged token: %v", err)
	}

	req := connect.NewRequest(&geoquerryv1.ExchangeAssertionRequest{
		InternalAssertion: forgedToken,
	})

	_, err = authSvc.ExchangeAssertion(context.Background(), req)
	if err == nil {
		t.Fatal("SECURITY VULNERABILITY: Forged token was accepted by auth service")
	}

	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestAdversarial_ExpiredAssertionReplay(t *testing.T) {
	pub, priv := newKeyPair(t)
	keyID := "key-production-01"
	ring := assertion.NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := assertion.NewVerifier(ring, assertion.DefaultIssuer, assertion.DefaultAudience)
	authSvc := auth.NewService(nil, verifier)

	// Issue token that expired 5 minutes ago
	now := time.Now().UTC()
	claims := assertion.Claims{
		Subject:   "usr_geologist_1",
		IssuedAt:  now.Add(-10 * time.Minute).Unix(),
		NotBefore: now.Add(-10 * time.Minute).Unix(),
		ExpiresAt: now.Add(-5 * time.Minute).Unix(),
		AuthTime:  now.Add(-15 * time.Minute).Unix(),
	}

	expiredToken, err := assertion.Sign(claims, priv, keyID)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	req := connect.NewRequest(&geoquerryv1.ExchangeAssertionRequest{
		InternalAssertion: expiredToken,
	})

	_, err = authSvc.ExchangeAssertion(context.Background(), req)
	if err == nil {
		t.Fatal("SECURITY VULNERABILITY: Expired assertion was accepted by auth service")
	}
	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

func TestAdversarial_ForgedKeyIDSpoofing(t *testing.T) {
	pub, priv := newKeyPair(t)
	ring := assertion.NewKeyRing(map[string]ed25519.PublicKey{"legit-key-id": pub})
	verifier := assertion.NewVerifier(ring, assertion.DefaultIssuer, assertion.DefaultAudience)
	authSvc := auth.NewService(nil, verifier)

	// Attacker points to arbitrary or nonexistent key ID
	claims := assertion.Claims{Subject: "usr_attacker"}
	spoofedToken, err := assertion.Sign(claims, priv, "malicious-key-id-999")
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	req := connect.NewRequest(&geoquerryv1.ExchangeAssertionRequest{
		InternalAssertion: spoofedToken,
	})

	_, err = authSvc.ExchangeAssertion(context.Background(), req)
	if err == nil {
		t.Fatal("SECURITY VULNERABILITY: Token with unknown key ID was accepted")
	}
}

// -----------------------------------------------------------------------
// 2. Broken Object Level Authorization (BOLA) & Tenancy Penetration Tests
// -----------------------------------------------------------------------

func TestAdversarial_OwnershipTransferWithoutSudo(t *testing.T) {
	tenantSvc := tenant.NewService(nil)

	// User is an Owner, but lacks active sudo confirmation
	ctxWithoutSudo := auth.WithIdentity(context.Background(), &auth.Identity{
		UserID:        "usr_owner_without_sudo",
		Subject:       "usr_owner_without_sudo",
		SudoExpiresAt: nil, // Sudo mode is inactive
	})

	req := connect.NewRequest(&geoquerryv1.TransferOrganizationOwnershipRequest{
		OrganizationId: "org_target_mine",
		TargetUserId:   "usr_potential_new_owner",
	})

	_, err := tenantSvc.TransferOrganizationOwnership(ctxWithoutSudo, req)
	if err == nil {
		t.Fatal("SECURITY VULNERABILITY: Ownership transfer succeeded without active sudo mode")
	}

	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
	}
}

func TestAdversarial_UnauthenticatedTenancyAccess(t *testing.T) {
	tenantSvc := tenant.NewService(nil)

	// Unauthenticated caller context
	ctxUnauthenticated := context.Background()

	req := connect.NewRequest(&geoquerryv1.ListOrganizationsRequest{})
	_, err := tenantSvc.ListOrganizations(ctxUnauthenticated, req)
	if err == nil {
		t.Fatal("SECURITY VULNERABILITY: Unauthenticated caller accessed organization list")
	}

	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Fatalf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
	}
}

// -----------------------------------------------------------------------
// 3. GIS Ingestion DoS & Buffer Overflow Attack Resistance
// -----------------------------------------------------------------------

func TestAdversarial_OversizedDatasetExhaustion(t *testing.T) {
	svc := gis.NewService(nil, nil, nil)
	ctx := context.Background()

	// Attacker attempts to flood storage with 10 GB file request
	req := connect.NewRequest(&geoquerryv1.InitiateDatasetUploadRequest{
		OrganizationId: "0b6f6c2e-1234-4abc-9def-000000000001",
		ProjectId:      "1b6f6c2e-1234-4abc-9def-000000000002",
		Kind:           geoquerryv1.DatasetKind_DATASET_KIND_GEOTIFF,
		DisplayName:    "malicious_10gb_layer.tif",
		ByteSize:       10 * 1024 * 1024 * 1024, // 10 GB exceeds 1 GB threshold
	})

	_, err := svc.InitiateDatasetUpload(ctx, req)
	if err == nil {
		t.Fatal("SECURITY VULNERABILITY: Oversized dataset (>1GB) was accepted by GIS ingestion service")
	}

	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Fatalf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
	}
}
