package billing

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

func TestBillingService(t *testing.T) {
	svc := NewService(nil, nil)
	ctx := context.Background()

	t.Run("GetPriceCatalog returns tiers", func(t *testing.T) {
		res, err := svc.GetPriceCatalog(ctx, connect.NewRequest(&v1.GetPriceCatalogRequest{}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res.Msg.Plans) == 0 {
			t.Errorf("expected plans, got 0")
		}
		foundEnterprise := false
		for _, p := range res.Msg.Plans {
			if p.PlanId == "tier_enterprise" {
				foundEnterprise = true
				if p.AmountMinorUnits != 49900 {
					t.Errorf("expected 49900 cents, got %d", p.AmountMinorUnits)
				}
			}
		}
		if !foundEnterprise {
			t.Errorf("enterprise plan not found")
		}
	})

	t.Run("InitiateMpesaStkPush generates payment attempt", func(t *testing.T) {
		orgID := uuid.New().String()

		userCtx := auth.WithIdentity(ctx, &auth.Identity{
			UserID:  "user-1",
			Subject: "user-1",
		})

		res, err := svc.InitiateMpesaStkPush(userCtx, connect.NewRequest(&v1.InitiateMpesaStkPushRequest{
			OrganizationId: orgID,
			PlanId:         "tier_enterprise",
			PhoneNumber:    "254712345678",
		}))
		if err != nil {
			t.Fatalf("expected success, got %v", err)
		}
		if res.Msg.PaymentAttemptId == "" {
			t.Errorf("expected non-empty payment attempt id")
		}
	})

	t.Run("CreateStripeCheckoutSession returns url", func(t *testing.T) {
		orgID := uuid.New().String()
		res, err := svc.CreateStripeCheckoutSession(ctx, connect.NewRequest(&v1.CreateStripeCheckoutSessionRequest{
			OrganizationId: orgID,
			PlanId:         "tier_enterprise",
			SuccessUrl:     "https://geoquerry.com/success",
			CancelUrl:      "https://geoquerry.com/cancel",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Msg.CheckoutUrl == "" {
			t.Errorf("expected non-empty checkout url")
		}
	})

	t.Run("GetSubscriptionStatus returns active entitlements", func(t *testing.T) {
		orgID := uuid.New().String()
		res, err := svc.GetSubscriptionStatus(ctx, connect.NewRequest(&v1.GetSubscriptionStatusRequest{
			OrganizationId: orgID,
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Msg.Subscription.Status != v1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE {
			t.Errorf("expected active subscription, got %v", res.Msg.Subscription.Status)
		}
		if len(res.Msg.Subscription.Entitlements) == 0 {
			t.Errorf("expected active entitlements")
		}
	})
}
