package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"

	"gitlab.com/austin4403/geoquerry/backend/pkg/assertion"
)

// CombinedInterceptor validates incoming ConnectRPC requests using either:
// 1. Ed25519-signed internal assertion tokens in "Authorization: Bearer <token>"
// 2. Pre-shared service API keys in "X-Geoquerry-Api-Key"
type CombinedInterceptor struct {
	verifier   *assertion.Verifier
	hashedKeys [][sha256.Size]byte
}

// NewCombinedInterceptor instantiates the dual auth gate.
func NewCombinedInterceptor(verifier *assertion.Verifier, apiKeys []string) *CombinedInterceptor {
	ci := &CombinedInterceptor{
		verifier: verifier,
	}
	for _, k := range apiKeys {
		if k != "" {
			h := sha256.Sum256([]byte(k))
			ci.hashedKeys = append(ci.hashedKeys, h)
		}
	}
	return ci
}

// WrapUnary guards unary RPCs.
func (ci *CombinedInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		newCtx, err := ci.authenticate(ctx, req.Header())
		if err != nil {
			return nil, err
		}
		return next(newCtx, req)
	}
}

// WrapStreamingHandler guards streaming RPCs.
func (ci *CombinedInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, stream connect.StreamingHandlerConn) error {
		newCtx, err := ci.authenticate(ctx, stream.RequestHeader())
		if err != nil {
			return err
		}
		return next(newCtx, stream)
	}
}

// WrapStreamingClient is a no-op required by the connect.Interceptor interface.
func (ci *CombinedInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (ci *CombinedInterceptor) authenticate(ctx context.Context, header http.Header) (context.Context, error) {
	authHeader := header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") && ci.verifier != nil {
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := ci.verifier.Verify(tokenStr, time.Now().UTC())
		if err != nil {
			return nil, connect.NewError(connect.CodeUnauthenticated, err)
		}

		var sudoExp *time.Time
		if claims.SudoExpiresAt > 0 {
			t := time.Unix(claims.SudoExpiresAt, 0).UTC()
			sudoExp = &t
		}

		ident := &Identity{
			UserID:        claims.Subject,
			Subject:       claims.Subject,
			AuthTime:      time.Unix(claims.AuthTime, 0).UTC(),
			AuthMethods:   claims.AuthMethodRefs,
			SudoExpiresAt: sudoExp,
			IsServiceAuth: false,
		}
		return WithIdentity(ctx, ident), nil
	}

	// Fallback to API Key
	apiKey := header.Get(APIKeyHeader)
	if apiKey != "" && len(ci.hashedKeys) > 0 {
		h := sha256.Sum256([]byte(apiKey))
		for _, want := range ci.hashedKeys {
			if subtle.ConstantTimeCompare(h[:], want[:]) == 1 {
				ident := &Identity{
					UserID:        "service-worker",
					Subject:       "service-account",
					AuthTime:      time.Now().UTC(),
					IsServiceAuth: true,
				}
				return WithIdentity(ctx, ident), nil
			}
		}
		return nil, connect.NewError(connect.CodeUnauthenticated, ErrUnauthorized)
	}

	// If no authentication configured (local dev with neither verifier nor keys), allow through
	if ci.verifier == nil && len(ci.hashedKeys) == 0 {
		return ctx, nil
	}

	return nil, connect.NewError(connect.CodeUnauthenticated, ErrUnauthorized)
}
