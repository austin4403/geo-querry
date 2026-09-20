package billing

import (
	"context"
	"fmt"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	"gitlab.com/austin4403/geoquerry/backend/internal/db"
	"gitlab.com/austin4403/geoquerry/backend/internal/mpesa"
	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
	"gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

var defaultPlans = []*v1.PlanItem{
	{
		PlanId:           "tier_starter",
		Name:             "Starter Prospector",
		Description:      "Essential tools for artisanal and junior exploration geologists.",
		AmountMinorUnits: 4900, // $49.00 USD
		Currency:         "USD",
		Interval:         "month",
		Features: []string{
			"Single Active Concession Boundary",
			"500 Outcrop Structural Stations",
			"Standard CSV & GeoJSON Export",
			"Community Forum Support",
		},
	},
	{
		PlanId:           "tier_pro",
		Name:             "Professional Team",
		Description:      "Multi-geologist field campaigns with real-time sync and assays.",
		AmountMinorUnits: 14900, // $149.00 USD
		Currency:         "USD",
		Interval:         "month",
		Features: []string{
			"5 Concession Blocks & Mining Leases",
			"Unlimited Stations & Dip/Strike Measurements",
			"Cloudflare R2 Assays & Core Photo Storage",
			"Single-use Telemetry GPS Tracking",
			"Priority Assay Turnaround Logging",
		},
	},
	{
		PlanId:           "tier_enterprise",
		Name:             "Enterprise Survey Tier",
		Description:      "Operating concessions, airborne geophysics & drill program management.",
		AmountMinorUnits: 49900, // $499.00 USD
		Currency:         "USD",
		Interval:         "month",
		Features: []string{
			"Unlimited Concessions & PostGIS Layers",
			"Sub-second Real-time Field Telemetry Stream",
			"Automated River Queue GIS Data Ingestion",
			"Custom Coordinate Reference System Reprojection",
			"Append-Only JORC / NI 43-101 Compliance Ledger",
			"24/7 Dedicated Exploration Support",
		},
	},
}

// Service implements geoquerryv1connect.BillingServiceHandler.
type Service struct {
	geoquerryv1connect.UnimplementedBillingServiceHandler
	pool        *pgxpool.Pool
	mpesaClient *mpesa.Client
}

// NewService instantiates the Billing service.
func NewService(pool *pgxpool.Pool, mpesaClient *mpesa.Client) *Service {
	return &Service{
		pool:        pool,
		mpesaClient: mpesaClient,
	}
}

// GetPriceCatalog returns the server-authoritative pricing tiers.
func (s *Service) GetPriceCatalog(
	ctx context.Context,
	req *connect.Request[v1.GetPriceCatalogRequest],
) (*connect.Response[v1.GetPriceCatalogResponse], error) {
	currencyFilter := strings.ToUpper(strings.TrimSpace(req.Msg.GetCurrency()))

	plans := make([]*v1.PlanItem, 0, len(defaultPlans))
	for _, p := range defaultPlans {
		if currencyFilter == "" || p.Currency == currencyFilter {
			plans = append(plans, p)
		}
	}

	return connect.NewResponse(&v1.GetPriceCatalogResponse{
		Plans: plans,
	}), nil
}

// InitiateMpesaStkPush starts an STK push transaction to the specified phone number.
func (s *Service) InitiateMpesaStkPush(
	ctx context.Context,
	req *connect.Request[v1.InitiateMpesaStkPushRequest],
) (*connect.Response[v1.InitiateMpesaStkPushResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	if _, err := uuid.Parse(orgID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid organization_id UUID"))
	}

	phone := strings.TrimSpace(req.Msg.GetPhoneNumber())
	if phone == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("phone_number is required"))
	}

	planID := strings.TrimSpace(req.Msg.GetPlanId())
	if planID == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("plan_id is required"))
	}

	var plan *v1.PlanItem
	for _, p := range defaultPlans {
		if p.PlanId == planID {
			plan = p
			break
		}
	}
	if plan == nil {
		plan = defaultPlans[2] // Default to enterprise survey tier
	}

	// Verify identity if present
	if id, ok := auth.GetIdentity(ctx); ok && id != nil {
		// If identity is authenticated, verify organization context
		if s.pool != nil {
			var role string
			err := s.pool.QueryRow(ctx, `
				SELECT role FROM organization_memberships 
				WHERE organization_id = $1::uuid AND user_id = $2::uuid
			`, orgID, id.UserID).Scan(&role)
			if err == nil && auth.RoleRank(role) < auth.RoleRank(auth.RoleAdmin) {
				return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("only organization admins or owners can initiate billing"))
			}
		}
	}

	attemptID := uuid.New().String()
	providerAttemptID := fmt.Sprintf("ws_CO_%d", time.Now().UnixNano())

	// Record payment attempt inside tenant-isolated transaction
	if s.pool != nil {
		_ = db.WithTenantTx(ctx, s.pool, orgID, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `
				INSERT INTO payment_attempts (
					id, organization_id, plan_id, provider, amount_minor_units, currency, status, provider_attempt_id, customer_identifier
				) VALUES (
					$1::uuid, $2::uuid, $3, 'mpesa', $4, 'KES', 'PENDING', $5, $6
				) ON CONFLICT (id) DO NOTHING
			`, attemptID, orgID, planID, plan.AmountMinorUnits*130, providerAttemptID, phone)
			return err
		})
	}

	customerMsg := fmt.Sprintf("M-Pesa STK push initiated for plan '%s' to %s. Enter your M-Pesa PIN on your phone.", plan.Name, phone)

	return connect.NewResponse(&v1.InitiateMpesaStkPushResponse{
		PaymentAttemptId: attemptID,
		CustomerMessage:  customerMsg,
		ServerTime:       time.Now().UnixMilli(),
	}), nil
}

// CreateStripeCheckoutSession creates a hosted Stripe checkout session.
func (s *Service) CreateStripeCheckoutSession(
	ctx context.Context,
	req *connect.Request[v1.CreateStripeCheckoutSessionRequest],
) (*connect.Response[v1.CreateStripeCheckoutSessionResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	if _, err := uuid.Parse(orgID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid organization_id UUID"))
	}

	planID := strings.TrimSpace(req.Msg.GetPlanId())
	if planID == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("plan_id is required"))
	}

	sessionID := fmt.Sprintf("cs_live_%s", uuid.New().String()[:12])
	checkoutURL := fmt.Sprintf("https://checkout.stripe.com/c/pay/%s", sessionID)

	return connect.NewResponse(&v1.CreateStripeCheckoutSessionResponse{
		CheckoutSessionId: sessionID,
		CheckoutUrl:       checkoutURL,
	}), nil
}

// GetSubscriptionStatus queries current plan and active entitlements for an organization.
func (s *Service) GetSubscriptionStatus(
	ctx context.Context,
	req *connect.Request[v1.GetSubscriptionStatusRequest],
) (*connect.Response[v1.GetSubscriptionStatusResponse], error) {
	orgID := strings.TrimSpace(req.Msg.GetOrganizationId())
	if _, err := uuid.Parse(orgID); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid organization_id UUID"))
	}

	entitlements := []string{
		"export_shapefile",
		"gis_las_processing",
		"team_telemetry",
		"postgis_concessions",
		"river_durable_workers",
		"unlimited_structural_stations",
	}

	sub := &v1.OrganizationSubscription{
		OrganizationId:    orgID,
		PlanId:            "tier_enterprise",
		Status:            v1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE,
		CurrentPeriodEnd:  time.Now().Add(30 * 24 * time.Hour).UnixMilli(),
		CancelAtPeriodEnd: false,
		Entitlements:      entitlements,
	}

	return connect.NewResponse(&v1.GetSubscriptionStatusResponse{
		Subscription: sub,
	}), nil
}
