package assertion

import (
	"crypto/ed25519"
	"crypto/rand"
	"testing"
	"time"
)

// BenchmarkAssertionSign measures Ed25519 assertion token generation throughput.
func BenchmarkAssertionSign(b *testing.B) {
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		b.Fatalf("failed to generate key: %v", err)
	}

	claims := Claims{
		Subject:  "usr-benchmarker-001",
		AuthTime: time.Now().UTC().Unix(),
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, err := Sign(claims, priv, "key-bench-01")
		if err != nil {
			b.Fatalf("sign failed: %v", err)
		}
	}
}

// BenchmarkAssertionVerify measures Ed25519 assertion verification throughput.
func BenchmarkAssertionVerify(b *testing.B) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		b.Fatalf("failed to generate key: %v", err)
	}

	keyID := "key-bench-01"
	ring := NewKeyRing(map[string]ed25519.PublicKey{keyID: pub})
	verifier := NewVerifier(ring, DefaultIssuer, DefaultAudience)

	claims := Claims{
		Subject:  "usr-benchmarker-001",
		AuthTime: time.Now().UTC().Unix(),
	}

	token, err := Sign(claims, priv, keyID)
	if err != nil {
		b.Fatalf("sign failed: %v", err)
	}

	now := time.Now().UTC()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_, err := verifier.Verify(token, now)
		if err != nil {
			b.Fatalf("verify failed: %v", err)
		}
	}
}
