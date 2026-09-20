// Package assertion implements Ed25519-signed short-lived internal identity
// assertions exchanged between the Next.js BFF and the Go authoritative backend.
//
// Invariants enforced by this package (per ADR-0002):
//  1. The assertion certifies ONLY verified identity and authentication context.
//  2. The assertion NEVER contains organization roles, permissions, or tenancy lists.
//  3. The maximum token lifetime is strictly bounded (<= 300 seconds / 5 minutes).
//  4. Clock drift tolerance is bounded to +/- 5 seconds.
//  5. Unknown or untrusted key IDs (kid) are immediately rejected.
package assertion

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInvalidFormat       = errors.New("assertion: invalid token format")
	ErrInvalidSignature    = errors.New("assertion: invalid cryptographic signature")
	ErrUnknownKeyID        = errors.New("assertion: unknown key ID (kid)")
	ErrExpired             = errors.New("assertion: token is expired")
	ErrPremature           = errors.New("assertion: token used before nbf (not before)")
	ErrExcessiveLifetime   = errors.New("assertion: token lifetime exceeds 300 seconds limit")
	ErrInvalidIssuer       = errors.New("assertion: invalid token issuer")
	ErrInvalidAudience     = errors.New("assertion: invalid token audience")
	ErrForbiddenClaimsFound = errors.New("assertion: forbidden tenant/role claims present in identity assertion")
	ErrEmptySubject        = errors.New("assertion: subject (user_id) cannot be empty")
)

const (
	DefaultIssuer          = "geoquerry-web-bff"
	DefaultAudience        = "geoquerry-core-backend"
	MaxTokenLifetime       = 300 * time.Second
	MaxClockSkew           = 5 * time.Second
)

// Header contains the cryptographic metadata of the assertion envelope.
type Header struct {
	Algorithm string `json:"alg"` // Strictly "Ed25519"
	KeyID     string `json:"kid"` // Key ID for multi-key rotation
	Type      string `json:"typ"` // Strictly "JWT" or "GEO-ASSERTION"
}

// Claims defines the authoritative claims permitted in internal assertions.
type Claims struct {
	Issuer         string   `json:"iss"`
	Audience       string   `json:"aud"`
	Subject        string   `json:"sub"` // User ID
	ExpiresAt      int64    `json:"exp"`
	NotBefore      int64    `json:"nbf"`
	IssuedAt       int64    `json:"iat"`
	TokenID        string   `json:"jti"`       // Random UUID for replay tracking
	AuthTime       int64    `json:"auth_time"` // Time of original user login
	AuthMethodRefs []string `json:"amr,omitempty"`
	SudoExpiresAt  int64    `json:"sudo_exp,omitempty"` // Sudo elevation window

	// Disallowed claims: if present in raw JSON, validation will reject the token
	Roles         any `json:"roles,omitempty"`
	Permissions   any `json:"permissions,omitempty"`
	Organizations any `json:"organizations,omitempty"`
	TenantID      any `json:"tenant_id,omitempty"`
}

// KeyRing manages trusted Ed25519 public keys indexed by Key ID.
type KeyRing struct {
	keys map[string]ed25519.PublicKey
}

// NewKeyRing initializes a KeyRing with a map of kid to ed25519.PublicKey.
func NewKeyRing(keys map[string]ed25519.PublicKey) *KeyRing {
	copied := make(map[string]ed25519.PublicKey, len(keys))
	for k, v := range keys {
		copied[k] = v
	}
	return &KeyRing{keys: copied}
}

// Sign issues an Ed25519-signed assertion token.
func Sign(claims Claims, privKey ed25519.PrivateKey, keyID string) (string, error) {
	if claims.Subject == "" {
		return "", ErrEmptySubject
	}
	if claims.Issuer == "" {
		claims.Issuer = DefaultIssuer
	}
	if claims.Audience == "" {
		claims.Audience = DefaultAudience
	}
	now := time.Now().UTC()
	if claims.IssuedAt == 0 {
		claims.IssuedAt = now.Unix()
	}
	if claims.NotBefore == 0 {
		claims.NotBefore = now.Add(-MaxClockSkew).Unix()
	}
	if claims.ExpiresAt == 0 {
		claims.ExpiresAt = now.Add(MaxTokenLifetime).Unix()
	}
	if claims.TokenID == "" {
		tokenUUID, err := generateRandomID()
		if err != nil {
			return "", fmt.Errorf("assertion: generate jti: %w", err)
		}
		claims.TokenID = tokenUUID
	}

	header := Header{
		Algorithm: "Ed25519",
		KeyID:     keyID,
		Type:      "GEO-ASSERTION",
	}

	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("assertion: marshal header: %w", err)
	}

	claimsBytes, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("assertion: marshal claims: %w", err)
	}

	headerB64 := base64.RawURLEncoding.EncodeToString(headerBytes)
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsBytes)
	signingInput := headerB64 + "." + claimsB64

	signature := ed25519.Sign(privKey, []byte(signingInput))
	sigB64 := base64.RawURLEncoding.EncodeToString(signature)

	return signingInput + "." + sigB64, nil
}

// Verifier validates incoming Ed25519 assertions against business and security invariants.
type Verifier struct {
	ring             *KeyRing
	expectedIssuer   string
	expectedAudience string
}

// NewVerifier creates an assertion verifier with the given KeyRing.
func NewVerifier(ring *KeyRing, expectedIssuer, expectedAudience string) *Verifier {
	if expectedIssuer == "" {
		expectedIssuer = DefaultIssuer
	}
	if expectedAudience == "" {
		expectedAudience = DefaultAudience
	}
	return &Verifier{
		ring:             ring,
		expectedIssuer:   expectedIssuer,
		expectedAudience: expectedAudience,
	}
}

// Verify decodes, checks signatures, and enforces all security invariants.
func (v *Verifier) Verify(rawToken string, now time.Time) (*Claims, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidFormat
	}

	headerB64, claimsB64, sigB64 := parts[0], parts[1], parts[2]

	headerBytes, err := base64.RawURLEncoding.DecodeString(headerB64)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid header base64", ErrInvalidFormat)
	}

	var header Header
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("%w: malformed header json", ErrInvalidFormat)
	}

	if header.Algorithm != "Ed25519" {
		return nil, fmt.Errorf("%w: unsupported algorithm %q", ErrInvalidSignature, header.Algorithm)
	}

	pubKey, ok := v.ring.keys[header.KeyID]
	if !ok || len(pubKey) == 0 {
		return nil, ErrUnknownKeyID
	}

	signature, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid signature base64", ErrInvalidSignature)
	}

	signingInput := headerB64 + "." + claimsB64
	if !ed25519.Verify(pubKey, []byte(signingInput), signature) {
		return nil, ErrInvalidSignature
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(claimsB64)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid claims base64", ErrInvalidFormat)
	}

	// 1. Raw check for forbidden tenancy/role claims in JSON
	var rawClaimsMap map[string]any
	if err := json.Unmarshal(claimsBytes, &rawClaimsMap); err != nil {
		return nil, fmt.Errorf("%w: malformed claims json", ErrInvalidFormat)
	}
	forbidden := []string{"roles", "role", "permissions", "permission", "organizations", "orgs", "tenant_id"}
	for _, key := range forbidden {
		if _, exists := rawClaimsMap[key]; exists {
			return nil, fmt.Errorf("%w: field %q is prohibited in identity assertions", ErrForbiddenClaimsFound, key)
		}
	}

	var claims Claims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return nil, fmt.Errorf("%w: unmarshal claims: %w", ErrInvalidFormat, err)
	}

	// 2. Validate Subject
	if strings.TrimSpace(claims.Subject) == "" {
		return nil, ErrEmptySubject
	}

	// 3. Validate Issuer & Audience
	if claims.Issuer != v.expectedIssuer {
		return nil, fmt.Errorf("%w: got %q, expected %q", ErrInvalidIssuer, claims.Issuer, v.expectedIssuer)
	}
	if claims.Audience != v.expectedAudience {
		return nil, fmt.Errorf("%w: got %q, expected %q", ErrInvalidAudience, claims.Audience, v.expectedAudience)
	}

	nowUnix := now.UTC().Unix()

	// 4. Validate Lifetime & Expiration
	if claims.ExpiresAt-claims.IssuedAt > int64(MaxTokenLifetime/time.Second)+int64(MaxClockSkew/time.Second) {
		return nil, ErrExcessiveLifetime
	}
	if nowUnix > claims.ExpiresAt+int64(MaxClockSkew/time.Second) {
		return nil, ErrExpired
	}

	// 5. Validate Not Before (nbf)
	if nowUnix < claims.NotBefore-int64(MaxClockSkew/time.Second) {
		return nil, ErrPremature
	}

	return &claims, nil
}

// HasActiveSudo reports whether the assertion currently carries valid elevated sudo privileges.
func (c *Claims) HasActiveSudo(now time.Time) bool {
	if c.SudoExpiresAt == 0 {
		return false
	}
	return now.UTC().Unix() <= c.SudoExpiresAt
}

func generateRandomID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	// UUID v4 format
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%12x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
