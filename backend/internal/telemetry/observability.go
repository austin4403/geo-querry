package telemetry

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type correlationKey string

const CorrelationIDHeader = "X-Correlation-ID"
const correlationCtxKey correlationKey = "correlation_id"

// Middleware adds a unique correlation ID to every incoming request context and response header.
func ObservabilityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		corrID := r.Header.Get(CorrelationIDHeader)
		if corrID == "" {
			var b [16]byte
			_, _ = rand.Read(b[:])
			corrID = hex.EncodeToString(b[:])
		}

		w.Header().Set(CorrelationIDHeader, corrID)
		ctx := context.WithValue(r.Context(), correlationCtxKey, corrID)

		// Sanitize path to prevent leaking sensitive credentials in query parameters
		cleanURL := r.URL.Path

		next.ServeHTTP(w, r.WithContext(ctx))

		duration := time.Since(start)
		log.Printf("http: method=%s path=%s duration_ms=%d correlation_id=%s",
			r.Method, cleanURL, duration.Milliseconds(), corrID)
	})
}

// HealthzHandler provides a simple liveness probe.
func HealthzHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":    "alive",
			"timestamp": time.Now().UTC().Unix(),
		})
	}
}

// ReadyzHandler verifies database pool connectivity for readiness probes.
func ReadyzHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if pool == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "unready",
				"reason": "database pool uninitialized",
			})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := pool.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "unready",
				"reason": "database ping failed",
			})
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":    "ready",
			"timestamp": time.Now().UTC().Unix(),
		})
	}
}
