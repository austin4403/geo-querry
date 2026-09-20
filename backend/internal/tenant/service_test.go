package tenant

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	geoquerryv1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

func TestRoleRankAndComparison(t *testing.T) {
	if auth.RoleRank(auth.RoleOwner) <= auth.RoleRank(auth.RoleAdmin) {
		t.Errorf("expected owner rank to be higher than admin")
	}
	if auth.RoleRank(auth.RoleAdmin) <= auth.RoleRank(auth.RoleGeologist) {
		t.Errorf("expected admin rank to be higher than geologist")
	}
	if auth.RoleRank(auth.RoleGeologist) <= auth.RoleRank(auth.RoleViewer) {
		t.Errorf("expected geologist rank to be higher than viewer")
	}
}

func TestAntiEscalationInvariants(t *testing.T) {
	// Admin attempts to promote someone to Owner -> should fail
	err := auth.CanManageRole(auth.RoleAdmin, auth.RoleGeologist, auth.RoleOwner)
	if err == nil {
		t.Errorf("expected error when admin attempts to promote to owner, got nil")
	}

	// Admin attempts to demote Owner -> should fail
	err = auth.CanManageRole(auth.RoleAdmin, auth.RoleOwner, auth.RoleAdmin)
	if err != auth.ErrCannotDemoteOwner {
		t.Errorf("expected ErrCannotDemoteOwner, got %v", err)
	}

	// Owner promotes Geologist to Admin -> should succeed
	err = auth.CanManageRole(auth.RoleOwner, auth.RoleGeologist, auth.RoleAdmin)
	if err != nil {
		t.Errorf("expected owner to be able to promote geologist to admin, got %v", err)
	}
}

func TestTransferOwnershipSudoRequirement(t *testing.T) {
	// Owner without sudo -> should fail
	err := auth.CanTransferOwnership(auth.RoleOwner, false)
	if err != auth.ErrSudoRequired {
		t.Errorf("expected ErrSudoRequired when owner lacks sudo, got %v", err)
	}

	// Admin with sudo -> should still fail (only owner can transfer)
	err = auth.CanTransferOwnership(auth.RoleAdmin, true)
	if err != auth.ErrForbidden {
		t.Errorf("expected ErrForbidden for non-owner, got %v", err)
	}

	// Owner with sudo -> should succeed
	err = auth.CanTransferOwnership(auth.RoleOwner, true)
	if err != nil {
		t.Errorf("expected success for owner with sudo, got %v", err)
	}
}

func TestTenantServiceListOrganizationsUnauthenticated(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background() // No identity attached
	req := connect.NewRequest(&geoquerryv1.ListOrganizationsRequest{})

	_, err := svc.ListOrganizations(ctx, req)
	if err == nil {
		t.Fatalf("expected unauthenticated error, got nil")
	}
}

func TestTenantServiceListOrganizationsAuthenticated(t *testing.T) {
	svc := NewService(nil)
	ident := &auth.Identity{
		UserID:  "user-test-123",
		Subject: "user-test-123",
	}
	ctx := auth.WithIdentity(context.Background(), ident)
	req := connect.NewRequest(&geoquerryv1.ListOrganizationsRequest{})

	res, err := svc.ListOrganizations(ctx, req)
	if err != nil {
		t.Fatalf("ListOrganizations failed: %v", err)
	}
	if len(res.Msg.Organizations) == 0 {
		t.Fatalf("expected at least 1 mock organization")
	}
}

func TestTenantServiceTransferOwnershipSudoCheck(t *testing.T) {
	svc := NewService(nil)
	now := time.Now().UTC()
	identWithoutSudo := &auth.Identity{
		UserID:        "owner-user-id",
		Subject:       "owner-user-id",
		SudoExpiresAt: nil,
	}
	ctx := auth.WithIdentity(context.Background(), identWithoutSudo)

	req := connect.NewRequest(&geoquerryv1.TransferOrganizationOwnershipRequest{
		OrganizationId: "org-1",
		TargetUserId:   "user-2",
	})

	_, err := svc.TransferOrganizationOwnership(ctx, req)
	if err == nil {
		t.Fatalf("expected sudo error, got nil")
	}

	// Now with active sudo
	activeSudo := now.Add(10 * time.Minute)
	identWithSudo := &auth.Identity{
		UserID:        "owner-user-id",
		Subject:       "owner-user-id",
		SudoExpiresAt: &activeSudo,
	}
	ctxSudo := auth.WithIdentity(context.Background(), identWithSudo)
	res, err := svc.TransferOrganizationOwnership(ctxSudo, req)
	if err != nil {
		t.Fatalf("unexpected error with active sudo: %v", err)
	}
	if !res.Msg.Success {
		t.Fatalf("expected transfer success")
	}
}
