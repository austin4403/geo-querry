// config_test.go verifies the boot-time contract: sane defaults when the
// environment is minimal, and precise failures when required values are
// missing or malformed.
package config

import (
	"strings"
	"testing"
	"time"
)

// TestLoadDefaults checks every fallback a local developer gets with just
// DATABASE_URL set (the only truly required variable).
func TestLoadDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/geoquerry")
	// t.Setenv auto-unsets everything else for the duration of the test,
	// so the defaults below are exercised exactly.

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("default port = %q, want 8080", cfg.Port)
	}
	if cfg.DBMaxConns != 4 || cfg.DBMinConns != 1 {
		t.Errorf("pool defaults = %d/%d, want 4/1", cfg.DBMaxConns, cfg.DBMinConns)
	}
	if cfg.TelemetryMemberTTL != 60*time.Second {
		t.Errorf("telemetry TTL = %v, want 60s", cfg.TelemetryMemberTTL)
	}
	if len(cfg.AllowedOrigins) != 0 {
		t.Errorf("expected no CORS origins by default, got %v", cfg.AllowedOrigins)
	}
}

// TestLoadRejectsMissingDatabase confirms the one hard requirement.
func TestLoadRejectsMissingDatabase(t *testing.T) {
	if _, err := Load(); err == nil {
		t.Fatal("Load must fail without DATABASE_URL")
	} else if !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("error should name the missing variable, got: %v", err)
	}
}

// TestLoadRejectsBadPort guards against a typo'd PORT silently starting on
// a broken listener.
func TestLoadRejectsBadPort(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("PORT", "not-a-port")
	if _, err := Load(); err == nil {
		t.Fatal("Load must fail with a non-numeric PORT")
	}
}

// TestLoadParsesOrigins checks the comma-separated CORS list, including
// whitespace tolerance (platforms often inject "a, b").
func TestLoadParsesOrigins(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/db")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://geoquerry.pages.dev, http://localhost:3000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	want := []string{"https://geoquerry.pages.dev", "http://localhost:3000"}
	if len(cfg.AllowedOrigins) != len(want) {
		t.Fatalf("origins = %v, want %v", cfg.AllowedOrigins, want)
	}
	for i := range want {
		if cfg.AllowedOrigins[i] != want[i] {
			t.Errorf("origin[%d] = %q, want %q", i, cfg.AllowedOrigins[i], want[i])
		}
	}
}
