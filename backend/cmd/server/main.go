// Command server is the single Geoquerry backend binary.
//
// BOOT ORDER (deliberate, and the reason each step can fail the boot):
//  1. load config     — refuse to start misconfigured (no DATABASE_URL etc.)
//  2. connect + ping  — a dead database is fatal: every RPC needs it
//  3. run migrations  — schema is code; the binary owns it end to end
//  4. mount handlers  — one composed GeoquerrySyncService handler
//  5. serve + wait    — graceful shutdown on SIGINT/SIGTERM (Koyeb, Ctrl-C)
//
// The whole body lives in run() so defers (pool.Close, hub.Close) actually
// execute on every exit path — log.Fatalf in main() would skip them.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// Embed the IANA timezone database into the binary. The runtime image
	// is `scratch` (no /usr/share/zoneinfo on disk); without this import
	// any time.LoadLocation("Africa/Nairobi") call would fail at runtime
	// instead of at build time. Costs ~450 KB in the binary, removes a
	// whole class of missing-file-on-scratch bugs.
	_ "time/tzdata"

	"connectrpc.com/connect"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	"gitlab.com/austin4403/geoquerry/backend/internal/config"
	"gitlab.com/austin4403/geoquerry/backend/internal/db"
	"gitlab.com/austin4403/geoquerry/backend/internal/mpesa"
	"gitlab.com/austin4403/geoquerry/backend/internal/paystack"
	"gitlab.com/austin4403/geoquerry/backend/internal/r2"
	"gitlab.com/austin4403/geoquerry/backend/internal/sync"
	"gitlab.com/austin4403/geoquerry/backend/internal/telemetry"
	geoquerryv1connect "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

// geoquerryAPI composes the half-services into the ONE handler type the
// generated connect code expects. Each embedded type implements exactly
// its own RPCs: *sync.Service (PushSyncQueue + PullProjectData),
// *telemetry.Handler (StreamLiveTelemetry), *r2.Service (CreatePhotoUpload).
// See the comments on those types for why none embeds the generated
// Unimplemented base (spoiler: ambiguous method promotion).
type geoquerryAPI struct {
	*sync.Service
	*telemetry.Handler
	*r2.UploadService
}

// Compile-time proof the composition satisfies the full handler interface.
var _ geoquerryv1connect.GeoquerrySyncServiceHandler = geoquerryAPI{}

func main() {
	if err := run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func run() error {
	// --- 1) Configuration ------------------------------------------------
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// Root context: cancelled by SIGINT/SIGTERM below; every long-running
	// component (server, telemetry reaper) hangs off it so a single signal
	// unwinds the whole process.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// --- 2) Database ------------------------------------------------------
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
	// Connect mounts the whole service under one prefix and serves all
	// three protocols (Connect, gRPC, gRPC-Web) with proto + JSON codecs.
	// When GEOQUERRY_API_KEYS is set, the auth interceptor gates every RPC
	// (unary AND streaming) behind a valid X-Geoquerry-Api-Key header —
	// see internal/auth for the threat model. With it unset (local dev)
	// the interceptor is nil and no gate applies.
	var handlerOpts []connect.HandlerOption
	if ic := auth.NewAPIKeyInterceptor(cfg.APIKeys); ic != nil {
		handlerOpts = append(handlerOpts, connect.WithInterceptors(ic))
		log.Printf("server: API-key auth ENABLED (%d key(s))", len(cfg.APIKeys))
	}
	servicePath, serviceHandler := geoquerryv1connect.NewGeoquerrySyncServiceHandler(api, handlerOpts...)
	mux.Handle(servicePath, serviceHandler)

	// Liveness: "is the process alive" — used by Koyeb's health checks.
	// Deliberately touches NOTHING (no DB) so a database blip doesn't get
	// the container killed, which would only make recovery slower.
	mux.HandleFunc("GET /livez", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Readiness: "can this instance actually serve traffic" — pings
	// Postgres, so a wedged pool drains from the load balancer while
	// healthy instances keep serving.
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		pingCtx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := pool.Ping(pingCtx); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	})

	// Protocol configuration: HTTP/1.1 for curl/health checks, plus
	// UNENCRYPTED HTTP/2 (h2c) which the Connect bidi telemetry stream
	// REQUIRES — bidi cannot run over HTTP/1.1. Go 1.24+ serves h2c
	// natively via the Protocols field (the old golang.org/x/net/h2c
	// wrapper is deprecated); no extra dependency needed.
	var protocols http.Protocols
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)

	// --- Payment webhooks (mounted ONLY when their credentials exist) ----
	// These are plain HTTP endpoints — NOT connect RPCs — so the API-key
	// interceptor does not apply. They carry their own auth instead:
	// Daraja's secret-path token, Paystack's HMAC-SHA512 signature.
	if cfg.MPesaEnabled {
		// Path embeds the high-entropy token; a wrong token is a plain 404
		// (an attacker cannot even confirm the endpoint exists).
		mux.HandleFunc("POST /webhooks/mpesa/{secret}", mpesa.WebhookHandler(cfg.MPesaWebhookToken))
		log.Printf("server: M-Pesa webhook mounted (%s)", cfg.MPesaEnv)
	}
	if cfg.PaystackEnabled {
		ps := paystack.New(cfg.PaystackKey, "")
		// The webhook re-verifies every charge against Paystack's API
		// before trusting it — the webhook says "look", verification
		// says "paid".
		mux.Handle("POST /webhooks/paystack", paystack.WebhookHandler(cfg.PaystackKey, ps.VerifyTransaction))
		log.Printf("server: Paystack webhook mounted")
	}

	// Middleware stack, outermost first: logging, then the request body
	// cap, then CORS, then routing.
	srv := &http.Server{
		Addr:      ":" + cfg.Port,
		Protocols: &protocols,
		Handler: withLogging(
			withBodyLimit(cfg.MaxBodyBytes,
				withCORS(cfg.AllowedOrigins, mux),
			),
		),

		// STREAMING-SAFE TIMEOUTS — do not "fix" these to Read/WriteTimeout!
		// net/http's Read/WriteTimeout span the ENTIRE request lifetime, so
		// a 30s WriteTimeout would murder every telemetry stream 30 seconds
		// in. Instead:
		//   - ReadHeaderTimeout: still blocks Slowloris-style header attacks
		//   - IdleTimeout: reaps keep-alive connections doing nothing
		// Body-level abuse is bounded per-RPC by the client's Connect
		// timeout and by the pool's query context.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// --- 5) Serve & shut down ----------------------------------------------
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	log.Printf("server: listening on :%s (geoquerry.v1 service at %s)", cfg.Port, servicePath)

	select {
	case err := <-errCh:
		// ErrServerClosed only arrives here if Shutdown was called; any
		// other start-up failure (port in use) is fatal.
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil

	case <-ctx.Done():
		// SIGTERM (Koyeb redeploy) or Ctrl-C: stop accepting connections
		// and let in-flight work drain — a half-finished sync batch must
		// finish, and telemetry streams close gracefully. Deferred hub and
		// pool closes run after run() returns.
		log.Println("server: shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("server: graceful shutdown failed: %v", err)
			return err
		}
		log.Println("server: drained")
		return nil
	}
}

// ---------------------------------------------------------------------------
// HTTP middleware
// ---------------------------------------------------------------------------

// withLogging logs one line per request: method, path, status, bytes, time.
// Health endpoints (/livez, /readyz) are skipped — Koyeb probes them every
// few seconds and would drown the log in noise.
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/livez" || r.URL.Path == "/readyz" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		// Path is sanitized (control chars stripped) and %q-quoted, so a
		// crafted URL cannot forge log lines — gosec G706 can't recognize
		// sanitizeLogField as a sanitizer, hence the audited suppression.
		log.Printf("http: %s %q -> %d (%d bytes, %s)", // #nosec G706 -- path sanitized via sanitizeLogField + %q escaping
			r.Method, sanitizeLogField(r.URL.Path), rec.status, rec.bytes,
			time.Since(start).Round(time.Millisecond))
	})
}

// sanitizeLogField neutralizes log injection (gosec G706): a request path
// is attacker-controlled, and a raw newline in it could forge additional
// log lines that an operator (or a log-based alert) would trust. %q would
// already escape newlines, but defense in depth: strip control characters
// outright so even exotic encodings cannot smuggle line breaks.
func sanitizeLogField(s string) string {
	clean := make([]rune, 0, len(s))
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			r = '?' // replace control chars instead of deleting: keep length
		}
		clean = append(clean, r)
	}
	return string(clean)
}

// statusRecorder captures what the inner handler wrote so the logging
// middleware can report the status code (net/http hides it otherwise).
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// Flush passes through to the underlying writer when it supports flushing.
// CRITICAL for Connect streaming: the bidi telemetry stream (and SSE-style
// responses) requires the handler to flush chunks as they are produced.
// Without this passthrough, the type assertion http.Flusher(w) inside
// connect fails and streaming handlers error out immediately — the exact
// symptom is a stream that returns in milliseconds with no data.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController (and anything walking the wrapper
// chain) reach the ORIGINAL ResponseWriter, preserving every optional
// interface the server stack provides (CloseNotifier, Hijacker, ...).
func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

// withBodyLimit caps request body size to protect the 512 MB container.
//
// WHY THE TELEMETRY STREAM IS EXEMPT (this is subtle):
// MaxBytesReader counts TOTAL bytes read over the request's whole lifetime.
// A bidi telemetry stream is ONE request whose body legitimately accumulates
// for hours (a breadcrumb every few seconds), so a blanket cap would kill
// every field session after a few hundred KB. The unary sync RPCs, by
// contrast, receive one bounded batch — capping those bounds attacker memory
// cost per request. We exempt the streaming procedure by its exact route.
func withBodyLimit(maxBytes int64, next http.Handler) http.Handler {
	streamProcedure := geoquerryv1connect.GeoquerrySyncServiceStreamLiveTelemetryProcedure

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == streamProcedure {
			next.ServeHTTP(w, r) // long-lived stream: see comment above
			return
		}
		// Cheap preflight: reject declared-oversize bodies before reading
		// a single byte of them.
		if r.ContentLength > maxBytes {
			http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		// Definite cap for lying/chunked clients: the read itself fails
		// once maxBytes is exceeded.
		r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		next.ServeHTTP(w, r)
	})
}

// withCORS makes the API callable from the web portal, which is served from
// a DIFFERENT origin (Cloudflare Pages) than the API (Koyeb). Browsers
// refuse cross-origin requests without these headers; the Flutter app and
// desktop studio are not browsers and ignore them entirely.
//
// Connect protocol specifics: browser clients POST with a non-simple
// Content-Type (application/proto) and custom Connect-* headers, so every
// request is preflighted — hence the full OPTIONS handling below.
func withCORS(allowedOrigins []string, next http.Handler) http.Handler {
	// wildcard=true when no origins configured: convenient for local dev,
	// tighten via CORS_ALLOWED_ORIGINS in production.
	wildcard := len(allowedOrigins) == 0

	allowAll := func() bool { return wildcard }

	// Headers the Connect / gRPC-Web browser clients actually send.
	// auth.APIKeyHeader is referenced (not re-typed) so a rename in one
	// place can never desynchronise CORS from the auth check.
	allowHeaders := "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, " +
		"Connect-Content-Encoding, Authorization, " + auth.APIKeyHeader

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (allowAll() || containsString(allowedOrigins, origin)) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			// Cache the preflight for a day: one OPTIONS per browser session
			// instead of one per RPC.
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		// Vary tells CDNs the response depends on Origin; without it a
		// cached ACAO header for portal.example.com could leak to a random
		// other site's request.
		w.Header().Add("Vary", "Origin")

		// Preflight: answer and stop — never reaches the real handler.
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", allowHeaders)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// containsString is a tiny linear membership test — origin lists are a
// handful of entries; a map or set would be over-engineering.
func containsString(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
