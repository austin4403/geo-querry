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

	"gitlab.com/austin4403/geoquerry/backend/internal/config"
	"gitlab.com/austin4403/geoquerry/backend/internal/db"
	"gitlab.com/austin4403/geoquerry/backend/internal/sync"
	"gitlab.com/austin4403/geoquerry/backend/internal/telemetry"
	geoquerryv1connect "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

// geoquerryAPI composes the two half-services into the ONE handler type the
// generated connect code expects. Embedding a *sync.Service (contributing
// PushSyncQueue + PullProjectData) and a *telemetry.Handler (contributing
// StreamLiveTelemetry) is unambiguous because each implements exactly its
// own RPCs — see the comments on those types for why neither embeds the
// generated Unimplemented base.
type geoquerryAPI struct {
	*sync.Service
	*telemetry.Handler
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

	api := geoquerryAPI{
		Service: sync.NewService(pool),
		Handler: telemetry.NewHandler(hub),
	}

	mux := http.NewServeMux()
	// Connect mounts the whole service under one prefix and serves all
	// three protocols (Connect, gRPC, gRPC-Web) with proto + JSON codecs.
	servicePath, serviceHandler := geoquerryv1connect.NewGeoquerrySyncServiceHandler(api)
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

	// Middleware stack, outermost first: logging sees the CORS-decorated
	// response; CORS wraps routing.
	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: withLogging(
			withCORS(cfg.AllowedOrigins, mux),
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
		log.Printf("http: %s %s -> %d (%d bytes, %s)",
			r.Method, r.URL.Path, rec.status, rec.bytes, time.Since(start).Round(time.Millisecond))
	})
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
	allowHeaders := "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, " +
		"Connect-Content-Encoding, Authorization, X-Geoquerry-Api-Key"

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
