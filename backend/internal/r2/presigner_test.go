// presigner_test.go verifies the R2 presign path OFFLINE: SigV4 signing is
// pure local cryptography, so dummy credentials exercise the whole flow
// (validation, key minting, URL shape) without any network.
package r2

import (
	"context"
	"strings"
	"testing"
	"time"

	"gitlab.com/austin4403/geoquerry/backend/internal/config"
)

func testPresigner(t *testing.T) *Presigner {
	t.Helper()
	return NewPresigner(config.Config{
		R2AccountID:       "0000000000000000deadbeef", // fake account id
		R2AccessKeyID:     "test-access-key",
		R2SecretAccessKey: "test-secret-key",
		R2Bucket:          "geoquerry-photos-test",
		PhotoPutTTL:       5 * time.Minute,
		PhotoMaxBytes:     15 << 20,
	})
}

// TestCreateUploadURLShape: a valid request yields a presigned URL whose
// query carries the SigV4 markers and whose key follows the server-owned
// layout (a uuid the CLIENT did not choose).
func TestCreateUploadURLShape(t *testing.T) {
	p := testPresigner(t)

	url, key, expires, err := p.CreateUploadURL(context.Background(),
		"0b6f6c2e-1234-4abc-9def-000000000001", "11111111-1111-4111-8111-111111111111",
		"outcrop.jpg", "image/jpeg", 4<<20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, marker := range []string{
		"X-Amz-Algorithm=AWS4-HMAC-SHA256",
		"X-Amz-Credential=test-access-key",
		"X-Amz-Signature=",
		// Path-style addressing (R2's documented S3-compatible form):
		// https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
		"/geoquerry-photos-test/photos/",
	} {
		if !strings.Contains(url, marker) {
			t.Errorf("URL missing %q:\n%s", marker, url)
		}
	}

	// Key must be server-controlled: photos/<project>/<station>/<uuid>.jpg
	parts := strings.Split(key, "/")
	if len(parts) != 4 || parts[0] != "photos" ||
		parts[1] != "0b6f6c2e-1234-4abc-9def-000000000001" ||
		parts[2] != "11111111-1111-4111-8111-111111111111" ||
		!strings.HasSuffix(parts[3], ".jpg") {
		t.Errorf("unexpected key layout: %q", key)
	}
	if len(parts[3]) != len("00000000-0000-4000-8000-000000000000.jpg") {
		t.Errorf("key file part is not a uuid+ext: %q", parts[3])
	}

	if time.Until(expires) <= 0 || time.Until(expires) > 6*time.Minute {
		t.Errorf("expiry %v not within the 5-minute TTL window", expires)
	}
}

// TestUnfiledPhotosGoToUnfiledScope: photos taken before a station exists
// still get a stable, sensible key namespace.
func TestUnfiledPhotosGoToUnfiledScope(t *testing.T) {
	p := testPresigner(t)
	_, key, _, err := p.CreateUploadURL(context.Background(),
		"0b6f6c2e-1234-4abc-9def-000000000001", "", "x.png", "image/png", 1000)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(key, "/unfiled/") {
		t.Errorf("key without station should use unfiled scope: %q", key)
	}
}

// TestRejectsNonImageContentTypes: the allowlist is the boundary — a
// presigned URL must never be usable to store an executable or PDF.
func TestRejectsNonImageContentTypes(t *testing.T) {
	p := testPresigner(t)
	for _, ct := range []string{"application/pdf", "video/mp4", "application/x-sh", "image/svg+xml"} {
		if _, _, _, err := p.CreateUploadURL(context.Background(), "p", "s", "f", ct, 100); err == nil {
			t.Errorf("content type %q must be rejected", ct)
		}
	}
}

// TestRejectsOversize: the declared length is baked into the signature, so
// rejecting at mint time caps attacker storage abuse.
func TestRejectsOversize(t *testing.T) {
	p := testPresigner(t)
	if _, _, _, err := p.CreateUploadURL(context.Background(), "p", "s", "f", "image/jpeg", 16<<20); err == nil {
		t.Error("16 MB must exceed the 15 MB cap")
	}
	if _, _, _, err := p.CreateUploadURL(context.Background(), "p", "s", "f", "image/jpeg", 0); err == nil {
		t.Error("zero-length must be rejected")
	}
}

// TestFileNameCannotPoisonKey: hostile file names change nothing — the key
// is uuid+allowlisted-extension, full stop.
func TestFileNameCannotPoisonKey(t *testing.T) {
	p := testPresigner(t)
	_, key, _, err := p.CreateUploadURL(context.Background(),
		"0b6f6c2e-1234-4abc-9def-000000000001", "", "../../../etc/passwd.jpg", "image/jpeg", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(key, "..") || strings.Contains(key, "passwd") {
		t.Errorf("file name leaked into key: %q", key)
	}
}

// TestNilServiceIsUnimplemented: deployments without R2 credentials must
// answer cleanly, not panic — the graceful-degradation contract.
func TestNilServiceIsUnimplemented(t *testing.T) {
	s := NewService(nil)
	if _, err := s.CreatePhotoUpload(context.Background(), nil); err == nil {
		t.Fatal("nil presigner must return unimplemented")
	}
}
