// main boots the GeoQuerry sync and live-telemetry microservice.
//
// LIFECYCLE (every step is explicit so boot failures are easy to diagnose):
//  1. Read configuration from environment.
//  2. Connect to the Neon PostGIS database and verify connectivity.
//  3. Apply pending SQL migrations (000001_init.sql, etc.).
//  4. Construct domain services:
//     - sync.Service (PostGIS read/write for offline sync batches)
//     - telemetry.Hub (in-memory lockless fan-out of live GPS breadcrumbs)
//     - r2.UploadService (presigned PUT URLs for field photo uploads)
//     - auth.Service (Ed25519 assertion exchange, sudo verification)
//     - tenant.Service (Organizations, memberships, and project management)
//  5. Mount Connect RPC handlers + payment webhooks on an http.ServeMux.
//  6. Start HTTP/1.1 + h2c server and block until SIGINT/SIGTERM.
//  7. Drain in-flight RPCs within a 15-second grace window, then exit 0.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	"gitlab.com/austin4403/geoquerry/backend/internal/config"
	"gitlab.com/austin4403/geoquerry/backend/internal/db"
	"gitlab.com/austin4403/geoquerry/backend/internal/mpesa"
	"gitlab.com/austin4403/geoquerry/backend/internal/paystack"
	"gitlab.com/austin4403/geoquerry/backend/internal/r2"
	"gitlab.com/austin4403/geoquerry/backend/internal/sync"
	"gitlab.com/austin4403/geoquerry/backend/internal/telemetry"
	"gitlab.com/austin4403/geoquerry/backend/internal/tenant"
	geoquerryv1connect "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

// geoquerryAPI composes the half-services into the ONE handler type the
// generated connect code expects. Each embedded type implements exactly
// its own RPCs: *sync.Service (PushSyncQueue + PullProjectData),
// *telemetry.Handler (StreamLiveTelemetry), *r2.UploadService (CreatePhotoUpload).
type geoquerryAPI struct {
	*sync.Service
	*telemetry.Handler
	*r2.UploadService
}

// Compile-time proof the composition satisfies the full handler interface.
var _ geoquerryv1connect.GeoquerrySyncServiceHandler = (*geoquerryAPI)(nil)

func main() {
	if err := run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// --- 1) Configuration ---------------------------------------------------
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	// --- 2) Database pool ---------------------------------------------------
	pool, err := db.Connect(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	// --- 3) Migrations -----------------------------------------------------
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}

	// --- 4) Handlers --------------------------------------------------------
	// Telemetry TTL: after this much radio silence a geologist greys out on
	// the live map; the reaper runs at ~1/4 TTL so the transition is prompt.
	hub := telemetry.NewHub(cfg.TelemetryMemberTTL, cfg.TelemetryMemberTTL/4)
	defer hub.Close()

	// Photo uploads: the UploadService is always embedded; with R2 unset
	// it is nil-safe and answers CodeUnimplemented, so deployments without
	// object storage degrade gracefully instead of erroring.
	r2Ready := cfg.R2AccountID != "" && cfg.R2AccessKeyID != "" &&
		cfg.R2SecretAccessKey != "" && cfg.R2Bucket != ""
	var uploads *r2.UploadService
	if r2Ready {
		uploads = r2.NewService(r2.NewPresigner(cfg))
		log.Printf("server: R2 photo uploads enabled (bucket %s, ttl %s)",
			cfg.R2Bucket, cfg.PhotoPutTTL)
	} else {
		uploads = r2.NewService(nil)
	}

	api := geoquerryAPI{
		Service:       sync.NewService(pool),
		Handler:       telemetry.NewHandler(hub),
		UploadService: uploads,
	}

	mux := http.NewServeMux()
	var handlerOpts []connect.HandlerOption
	if ic := auth.NewAPIKeyInterceptor(cfg.APIKeys); ic != nil {
		handlerOpts = append(handlerOpts, connect.WithInterceptors(ic))
		log.Printf("server: API-key auth ENABLED (%d key(s))", len(cfg.APIKeys))
	}

	// Mount GeoquerrySyncService
	servicePath, serviceHandler := geoquerryv1connect.NewGeoquerrySyncServiceHandler(api, handlerOpts...)
	mux.Handle(servicePath, serviceHandler)

	// Mount AuthService
	authSvc := auth.NewService(pool, nil)
	authPath, authHandler := geoquerryv1connect.NewAuthServiceHandler(authSvc, handlerOpts...)
	mux.Handle(authPath, authHandler)

	// Mount TenantService
	tenantSvc := tenant.NewService(pool)
	tenantPath, tenantHandler := geoquerryv1connect.NewTenantServiceHandler(tenantSvc, handlerOpts...)
	mux.Handle(tenantPath, tenantHandler)

	// Liveness: "is the process alive"
	mux.HandleFunc("GET /healthz", telemetry.HealthzHandler())
	mux.HandleFunc("GET /livez", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Readiness: "can this instance actually serve traffic"
	mux.HandleFunc("GET /readyz", telemetry.ReadyzHandler(pool))

	// Protocol configuration: HTTP/1.1 plus h2c
	var protocols http.Protocols
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)

	// --- Payment webhooks ---------------------------------------------------
	if cfg.MPesaEnabled {
		mux.HandleFunc("POST /webhooks/mpesa/{secret}", mpesa.WebhookHandler(cfg.MPesaWebhookToken))
		log.Printf("server: M-Pesa webhook mounted (%s)", cfg.MPesaEnv)
	}
	if cfg.PaystackEnabled {
		ps := paystack.New(cfg.PaystackKey, "")
		mux.Handle("POST /webhooks/paystack", paystack.WebhookHandler(cfg.PaystackKey, ps.VerifyTransaction))
		log.Printf("server: Paystack webhook mounted")
	}

	// Wrap mux in observability and logging middleware
	loggedMux := telemetry.ObservabilityMiddleware(loggingMiddleware(mux))

	// Middleware stack, outermost first: logging, then the request body
	// cap, then CORS, then routing.
	srv := &http.Server{
		Addr: fmt.Sprintf(":%s", cfg.Port),
		Handler: withMaxBytes(
			withCORS(cfg.AllowedOrigins, loggedMux),
			cfg.MaxBodyBytes,
		),
		Protocols:         &protocols,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("server: listening on :%s (http/1.1 + h2c)", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		log.Printf("server: shutting down (waiting up to %s for in-flight RPCs)", cfg.ShutdownTimeout)
	case err := <-errCh:
		return fmt.Errorf("listen: %w", err)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	log.Printf("server: stopped cleanly")
	return nil
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &statusTrackingResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(ww, r)
		log.Printf("%s %s %s %d %s",
			r.RemoteAddr,
			r.Method,
			r.URL.Path,
			ww.status,
			time.Since(start).Round(time.Millisecond),
		)
	})
}

type statusTrackingResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusTrackingResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func withMaxBytes(next http.Handler, limit int64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

func withCORS(allowedOrigins []string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowed[origin]; ok || len(allowed) == 0 {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers",
					"Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, "+
						auth.APIKeyHeader+", Authorization, X-Correlation-ID")
				w.Header().Set("Access-Control-Expose-Headers",
					"Connect-Protocol-Version, Connect-Content-Encoding, X-Correlation-ID")
			}
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
