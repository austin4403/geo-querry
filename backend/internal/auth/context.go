package auth

import (
	"context"
	"errors"
	"time"

	geoquerryv1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

type contextKey string

const (
	identityKey contextKey = "geoquerry_identity"
)

// Identity represents the cryptographically verified principal making the request.
type Identity struct {
	UserID        string
	Subject       string
	AuthTime      time.Time
	AuthMethods   []string
	SudoExpiresAt *time.Time
	IsServiceAuth bool
}

// HasActiveSudo reports whether the identity has an elevated sudo session active at referenceTime.
func (id *Identity) HasActiveSudo(referenceTime time.Time) bool {
	if id == nil || id.SudoExpiresAt == nil {
		return false
	}
	return id.SudoExpiresAt.After(referenceTime)
}

// WithIdentity stores the verified identity in the context.
func WithIdentity(ctx context.Context, id *Identity) context.Context {
	return context.WithValue(ctx, identityKey, id)
}

// GetIdentity retrieves the verified identity from context if present.
func GetIdentity(ctx context.Context) (*Identity, bool) {
	id, ok := ctx.Value(identityKey).(*Identity)
	return id, ok && id != nil
}

// Role Hierarchy constants
const (
	RoleOwner     = "owner"
	RoleAdmin     = "admin"
	RoleGeologist = "geologist"
	RoleViewer    = "viewer"
)

// ProtoRoleToString maps the Protobuf enum to database string representation.
func ProtoRoleToString(role geoquerryv1.TenantRole) string {
	switch role {
	case geoquerryv1.TenantRole_TENANT_ROLE_OWNER:
		return RoleOwner
	case geoquerryv1.TenantRole_TENANT_ROLE_ADMIN:
		return RoleAdmin
	case geoquerryv1.TenantRole_TENANT_ROLE_GEOLOGIST:
		return RoleGeologist
	case geoquerryv1.TenantRole_TENANT_ROLE_VIEWER:
		return RoleViewer
	default:
		return ""
	}
}

// StringToProtoRole maps a database role string to the Protobuf enum.
func StringToProtoRole(role string) geoquerryv1.TenantRole {
	switch role {
	case RoleOwner:
		return geoquerryv1.TenantRole_TENANT_ROLE_OWNER
	case RoleAdmin:
		return geoquerryv1.TenantRole_TENANT_ROLE_ADMIN
	case RoleGeologist:
		return geoquerryv1.TenantRole_TENANT_ROLE_GEOLOGIST
	case RoleViewer:
		return geoquerryv1.TenantRole_TENANT_ROLE_VIEWER
	default:
		return geoquerryv1.TenantRole_TENANT_ROLE_UNSPECIFIED
	}
}

// RoleRank returns numeric hierarchy for comparative checking.
func RoleRank(role string) int {
	switch role {
	case RoleOwner:
		return 40
	case RoleAdmin:
		return 30
	case RoleGeologist:
		return 20
	case RoleViewer:
		return 10
	default:
		return 0
	}
}

// Anti-Escalation Checks:

var (
	ErrUnauthorized            = errors.New("unauthorized")
	ErrForbidden               = errors.New("insufficient permissions for requested action")
	ErrSudoRequired            = errors.New("elevated sudo authorization required for this operation")
	ErrCannotDemoteOwner       = errors.New("cannot demote or remove organization owner")
	ErrCannotEscalateBeyondSelf = errors.New("cannot grant permissions or roles higher than current role")
	ErrSoleOwnerCannotLeave    = errors.New("sole owner cannot vacate organization without ownership transfer")
)

// CanManageRole verifies if actorRole can assign or modify targetRole.
func CanManageRole(actorRole, currentRole, newRole string) error {
	actorRank := RoleRank(actorRole)
	currentRank := RoleRank(currentRole)
	newRank := RoleRank(newRole)

	// Only owner can touch owner role
	if currentRole == RoleOwner && actorRole != RoleOwner {
		return ErrCannotDemoteOwner
	}
	if newRole == RoleOwner && actorRole != RoleOwner {
		return ErrForbidden
	}

	// Actor cannot assign roles higher than their own
	if newRank > actorRank {
		return ErrCannotEscalateBeyondSelf
	}

	// Actor cannot manage users who outrank them
	if currentRank > actorRank {
		return ErrForbidden
	}

	return nil
}

// CanTransferOwnership checks if actor can execute ownership transfer.
func CanTransferOwnership(actorRole string, hasActiveSudo bool) error {
	if actorRole != RoleOwner {
		return ErrForbidden
	}
	if !hasActiveSudo {
		return ErrSudoRequired
	}
	return nil
}
