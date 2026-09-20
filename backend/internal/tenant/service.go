package tenant

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	"gitlab.com/austin4403/geoquerry/backend/internal/db"
	geoquerryv1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
	"gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

// Service implements the geoquerry.v1.TenantService ConnectRPC service.
type Service struct {
	pool *pgxpool.Pool
	geoquerryv1connect.UnimplementedTenantServiceHandler
}

// NewService constructs a TenantService instance.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// Helper to check caller's membership and role in an organization.
func (s *Service) getCallerRole(ctx context.Context, orgID, userID string) (string, error) {
	if s.pool == nil {
		return auth.RoleOwner, nil // In-memory/test fallback
	}
	var role string
	err := s.pool.QueryRow(ctx, `
		SELECT role FROM organization_members 
		WHERE organization_id = $1 AND user_id = $2
	`, orgID, userID).Scan(&role)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", auth.ErrForbidden
		}
		return "", fmt.Errorf("db query member role: %w", err)
	}
	return role, nil
}

// ListOrganizations lists all organizations the calling user belongs to.
func (s *Service) ListOrganizations(
	ctx context.Context,
	req *connect.Request[geoquerryv1.ListOrganizationsRequest],
) (*connect.Response[geoquerryv1.ListOrganizationsResponse], error) {
	ident, ok := auth.GetIdentity(ctx)
	if !ok || ident.UserID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("unauthenticated session"))
	}

	var orgs []*geoquerryv1.OrganizationSummary
	if s.pool != nil {
		rows, err := s.pool.Query(ctx, `
			SELECT o.id, o.name, o.slug, om.role, o.created_at
			FROM organizations o
			JOIN organization_members om ON om.organization_id = o.id
			WHERE om.user_id = $1
			ORDER BY o.created_at DESC
			LIMIT 50
		`, ident.UserID)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to query organizations: %w", err))
		}
		defer rows.Close()

		for rows.Next() {
			var id, name, slug, role string
			var createdAt time.Time
			if err := rows.Scan(&id, &name, &slug, &role, &createdAt); err != nil {
				return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("scan org row: %w", err))
			}
			orgs = append(orgs, &geoquerryv1.OrganizationSummary{
				Id:         id,
				Name:       name,
				Slug:       slug,
				CallerRole: auth.StringToProtoRole(role),
				CreatedAt:  createdAt.Unix(),
			})
		}
	} else {
		// Mock organization for test harnesses
		orgs = append(orgs, &geoquerryv1.OrganizationSummary{
			Id:         "org-test-default",
			Name:       "Default Organization",
			Slug:       "default-org",
			CallerRole: geoquerryv1.TenantRole_TENANT_ROLE_OWNER,
			CreatedAt:  time.Now().Unix(),
		})
	}

	return connect.NewResponse(&geoquerryv1.ListOrganizationsResponse{
		Organizations: orgs,
		Pagination: &geoquerryv1.CursorPaginationResponse{
			HasMore: false,
		},
	}), nil
}

// CreateOrganization provisions a new organization and grants the creator the 'owner' role.
func (s *Service) CreateOrganization(
	ctx context.Context,
	req *connect.Request[geoquerryv1.CreateOrganizationRequest],
) (*connect.Response[geoquerryv1.CreateOrganizationResponse], error) {
	ident, ok := auth.GetIdentity(ctx)
	if !ok || ident.UserID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("unauthenticated session"))
	}

	if req.Msg.Name == "" || req.Msg.Slug == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("organization name and slug are required"))
	}

	now := time.Now().UTC()
	var orgID string

	if s.pool != nil {
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("begin tx: %w", err))
		}
		defer func() { _ = tx.Rollback(ctx) }()

		err = tx.QueryRow(ctx, `
			INSERT INTO organizations (name, slug, created_at, updated_at)
			VALUES ($1, $2, $3, $3)
			RETURNING id
		`, req.Msg.Name, req.Msg.Slug, now).Scan(&orgID)
		if err != nil {
			return nil, connect.NewError(connect.CodeAlreadyExists, fmt.Errorf("slug already in use: %w", err))
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO organization_members (organization_id, user_id, role, joined_at)
			VALUES ($1, $2, 'owner', $3)
		`, orgID, ident.UserID, now)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to assign owner: %w", err))
		}

		if err := tx.Commit(ctx); err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("commit tx: %w", err))
		}
	} else {
		orgID = "org-created-mock"
	}

	return connect.NewResponse(&geoquerryv1.CreateOrganizationResponse{
		Organization: &geoquerryv1.OrganizationSummary{
			Id:         orgID,
			Name:       req.Msg.Name,
			Slug:       req.Msg.Slug,
			CallerRole: geoquerryv1.TenantRole_TENANT_ROLE_OWNER,
			CreatedAt:  now.Unix(),
		},
	}), nil
}

// TransferOrganizationOwnership transfers organization ownership to another active member.
// Enforces:
// 1. Only existing Owner can initiate transfer.
// 2. Sudo mode must be active.
// 3. New owner must already be an active member.
func (s *Service) TransferOrganizationOwnership(
	ctx context.Context,
	req *connect.Request[geoquerryv1.TransferOrganizationOwnershipRequest],
) (*connect.Response[geoquerryv1.TransferOrganizationOwnershipResponse], error) {
	ident, ok := auth.GetIdentity(ctx)
	if !ok || ident.UserID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("unauthenticated session"))
	}

	orgID := req.Msg.OrganizationId
	targetUserID := req.Msg.TargetUserId
	if orgID == "" || targetUserID == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("organization_id and target_user_id are required"))
	}

	callerRole, err := s.getCallerRole(ctx, orgID, ident.UserID)
	if err != nil {
		return nil, connect.NewError(connect.CodePermissionDenied, err)
	}

	now := time.Now().UTC()
	if err := auth.CanTransferOwnership(callerRole, ident.HasActiveSudo(now)); err != nil {
		if err == auth.ErrSudoRequired {
			return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("sudo mode required to transfer ownership"))
		}
		return nil, connect.NewError(connect.CodePermissionDenied, err)
	}

	if s.pool != nil {
		err := db.WithTenantTx(ctx, s.pool, orgID, func(tx pgx.Tx) error {
			// Demote previous owner to admin
			_, err := tx.Exec(ctx, `
				UPDATE organization_members SET role = 'admin'
				WHERE organization_id = $1 AND user_id = $2
			`, orgID, ident.UserID)
			if err != nil {
				return err
			}

			// Promote target user to owner
			res, err := tx.Exec(ctx, `
				UPDATE organization_members SET role = 'owner'
				WHERE organization_id = $1 AND user_id = $2
			`, orgID, targetUserID)
			if err != nil {
				return err
			}
			if res.RowsAffected() == 0 {
				return fmt.Errorf("target user is not a member of this organization")
			}
			return nil
		})
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("ownership transfer failed: %w", err))
		}
	}

	return connect.NewResponse(&geoquerryv1.TransferOrganizationOwnershipResponse{
		Success: true,
	}), nil
}

// ListProjects lists projects within an organization.
func (s *Service) ListProjects(
	ctx context.Context,
	req *connect.Request[geoquerryv1.ListProjectsRequest],
) (*connect.Response[geoquerryv1.ListProjectsResponse], error) {
	ident, ok := auth.GetIdentity(ctx)
	if !ok || ident.UserID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("unauthenticated session"))
	}

	orgID := req.Msg.OrganizationId
	if orgID == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("organization_id is required"))
	}

	if _, err := s.getCallerRole(ctx, orgID, ident.UserID); err != nil {
		return nil, connect.NewError(connect.CodePermissionDenied, err)
	}

	var projects []*geoquerryv1.ProjectSummary
	if s.pool != nil {
		err := db.WithTenantTx(ctx, s.pool, orgID, func(tx pgx.Tx) error {
			rows, err := tx.Query(ctx, `
				SELECT id, organization_id, name, description, target_commodity, crs_epsg, updated_at
				FROM projects
				WHERE organization_id = $1 AND is_deleted = false
				ORDER BY updated_at DESC
				LIMIT 50
			`, orgID)
			if err != nil {
				return err
			}
			defer rows.Close()

			for rows.Next() {
				var p geoquerryv1.ProjectSummary
				var desc, commodity *string
				if err := rows.Scan(&p.Id, &p.OrganizationId, &p.Name, &desc, &commodity, &p.CrsEpsg, &p.UpdatedAt); err != nil {
					return err
				}
				if desc != nil {
					p.Description = *desc
				}
				if commodity != nil {
					p.TargetCommodity = *commodity
				}
				projects = append(projects, &p)
			}
			return nil
		})
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to query projects: %w", err))
		}
	}

	return connect.NewResponse(&geoquerryv1.ListProjectsResponse{
		Projects: projects,
		Pagination: &geoquerryv1.CursorPaginationResponse{
			HasMore: false,
		},
	}), nil
}

// CreateProject provisions a new project under the organization.
func (s *Service) CreateProject(
	ctx context.Context,
	req *connect.Request[geoquerryv1.CreateProjectRequest],
) (*connect.Response[geoquerryv1.CreateProjectResponse], error) {
	ident, ok := auth.GetIdentity(ctx)
	if !ok || ident.UserID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("unauthenticated session"))
	}

	orgID := req.Msg.OrganizationId
	if orgID == "" || req.Msg.Name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("organization_id and project name are required"))
	}

	callerRole, err := s.getCallerRole(ctx, orgID, ident.UserID)
	if err != nil {
		return nil, connect.NewError(connect.CodePermissionDenied, err)
	}

	// Geologists, Admins, and Owners can create projects; Viewers cannot
	if auth.RoleRank(callerRole) < auth.RoleRank(auth.RoleGeologist) {
		return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("viewers cannot create projects"))
	}

	crs := req.Msg.CrsEpsg
	if crs == "" {
		crs = "EPSG:4326"
	}

	nowMs := time.Now().UnixMilli()
	var projID string

	if s.pool != nil {
		err := db.WithTenantTx(ctx, s.pool, orgID, func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `
				INSERT INTO projects (organization_id, name, description, target_commodity, crs_epsg, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6)
				RETURNING id
			`, orgID, req.Msg.Name, req.Msg.Description, req.Msg.TargetCommodity, crs, nowMs).Scan(&projID)
		})
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to create project: %w", err))
		}
	} else {
		projID = "p-mock-12345"
	}

	return connect.NewResponse(&geoquerryv1.CreateProjectResponse{
		Project: &geoquerryv1.ProjectSummary{
			Id:              projID,
			OrganizationId:  orgID,
			Name:            req.Msg.Name,
			Description:     req.Msg.Description,
			TargetCommodity: req.Msg.TargetCommodity,
			CrsEpsg:         crs,
			UpdatedAt:       nowMs,
		},
	}), nil
}
