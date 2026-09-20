// main boots the GeoQuerry sync and live-telemetry microservice.
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
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	"gitlab.com/austin4403/geoquerry/backend/internal/billing"
	"gitlab.com/austin4403/geoquerry/backend/internal/config"
	"gitlab.com/austin4403/geoquerry/backend/internal/db"
	"gitlab.com/austin4403/geoquerry/backend/internal/gis"
	"gitlab.com/austin4403/geoquerry/backend/internal/mpesa"
	"gitlab.com/austin4403/geoquerry/backend/internal/paystack"
	"gitlab.com/austin4403/geoquerry/backend/internal/queue"
	"gitlab.com/austin4403/geoquerry/backend/internal/r2"
	"gitlab.com/austin4403/geoquerry/backend/internal/sync"
	"gitlab.com/austin4403/geoquerry/backend/internal/telemetry"
	"gitlab.com/austin4403/geoquerry/backend/internal/tenant"
	geoquerryv1connect "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

type geoquerryAPI struct {
	*sync.Service
	*telemetry.Handler
	*r2.UploadService
}

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

	// --- 4) River Queue Engine ----------------------------------------------
	var riverClient *river.Client[pgx.Tx]
	if pool != nil {
		rClient, qErr := queue.NewQueueEngine(ctx, pool)
		if qErr != nil {
			log.Printf("server: warning: river engine disabled: %v", qErr)
		} else {
			riverClient = rClient
			log.Printf("server: River durable queue engine active")
		}
	}

	// --- 5) Handlers --------------------------------------------------------
	hub := telemetry.NewHub(cfg.TelemetryMemberTTL, cfg.TelemetryMemberTTL/4)
	defer hub.Close()

	r2Ready := cfg.R2AccountID != "" && cfg.R2AccessKeyID != "" &&
		cfg.R2SecretAccessKey != "" && cfg.R2Bucket != ""
	var uploads *r2.UploadService
	var presigner *r2.Presigner
	if r2Ready {
		presigner = r2.NewPresigner(cfg)
		uploads = r2.NewService(presigner)
		log.Printf("server: R2 photo uploads enabled (bucket %s, ttl %s)",
			cfg.R2Bucket, cfg.PhotoPutTTL)
	} else {
		uploads = r2.NewService(nil)
	}

	telemetryHandler := telemetry.NewHandler(hub)

	api := geoquerryAPI{
		Service:       sync.NewService(pool),
		Handler:       telemetryHandler,
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

	// Mount BillingService
	var mpesaClient *mpesa.Client
	if cfg.MPesaEnabled {
		mpesaClient = mpesa.New(cfg.MPesaEnv, cfg.MPesaShortcode, cfg.MPesaPasskey, cfg.MPesaConsumerKey, cfg.MPesaConsumerSec, "")
	}
	billingSvc := billing.NewService(pool, mpesaClient)
	billingPath, billingHandler := geoquerryv1connect.NewBillingServiceHandler(billingSvc, handlerOpts...)
	mux.Handle(billingPath, billingHandler)

	// Mount GisIngestionService
	gisSvc := gis.NewService(pool, riverClient, presigner)
	gisPath, gisHandler := geoquerryv1connect.NewGisIngestionServiceHandler(gisSvc, handlerOpts...)
	mux.Handle(gisPath, gisHandler)

	// Mount TelemetryService standalone
	telemPath, telemHandler := geoquerryv1connect.NewTelemetryServiceHandler(telemetryHandler, handlerOpts...)
	mux.Handle(telemPath, telemHandler)

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

	serverErr := make(chan error, 1)
	go func() {
		log.Printf("server: listening on :%s (cors: %v)", cfg.Port, cfg.AllowedOrigins)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case <-ctx.Done():
		log.Printf("server: shutdown signal received; draining...")
	case err := <-serverErr:
		return fmt.Errorf("server: %w", err)
	}

	drainCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(drainCtx); err != nil {
		return fmt.Errorf("server: drain: %w", err)
	}
	log.Printf("server: drained cleanly")
	return nil
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &statusResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		log.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, rw.status, time.Since(start).Round(time.Millisecond))
	})
}

type statusResponseWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusResponseWriter) WriteHeader(status int) {
	s.status = status
	s.ResponseWriter.WriteHeader(status)
}

func withMaxBytes(next http.Handler, maxBytes int64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > maxBytes {
			http.Error(w, fmt.Sprintf("payload exceeds %d bytes", maxBytes), http.StatusRequestEntityTooLarge)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		next.ServeHTTP(w, r)
	})
}

func withCORS(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		var allowed bool
		for _, o := range allowedOrigins {
			if o == "*" || o == origin {
				allowed = true
				break
			}
		}

		if allowed {
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version, Authorization, X-Geoquerry-Api-Key, Connect-Timeout-Ms, X-Correlation-ID")
			w.Header().Set("Access-Control-Expose-Headers", "Connect-Protocol-Version, X-Correlation-ID")
			w.Header().Set("Access-Control-Max-Age", "7200")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
