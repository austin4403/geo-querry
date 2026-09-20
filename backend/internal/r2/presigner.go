// Package r2 issues short-lived presigned upload URLs for Cloudflare R2,
// the S3-compatible object store that holds all field photos.
//
// THE FLOW THIS ENABLES (see proto/geoquerry/v1/media.proto):
//  1. Field device: "I have a 4 MB JPEG for station ST-04" (this RPC)
//  2. This server:  validates, mints a server-controlled object key,
//     signs a 5-minute PUT URL, returns both
//  3. Device:       PUTs the bytes DIRECTLY to R2 — they never touch the
//     512 MB API container
//  4. Device:       stores the returned r2_key in the sample/vegetation
//     record; it syncs like any other field edit
//
// SECURITY NOTES
//   - The object key is SERVER-generated (uuid + allowlisted extension).
//     The client's file_name only ever informs the extension — a hostile
//     client cannot smuggle paths like "../../evil" into storage keys.
//   - Content-Type and Content-Length are baked into the signature: the
//     URL is only valid for exactly the declared image type and size.
//   - URLs expire in minutes (R2_PUT_TTL), so a leaked URL is a small,
//     short-lived problem, not a persistent write hole.
package r2

import (
	"context"
	"fmt"
	"path"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"

	"gitlab.com/austin4403/geoquerry/backend/internal/config"
)

// allowedContentTypes is the image allowlist enforced BEFORE any signing.
// Everything a field camera produces and nothing it doesn't — a presigned
// URL must never be usable to plant, say, an executable.
var allowedContentTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/heic": ".heic",
}

// DefaultPutTTL is how long presigned URLs stay valid. Five minutes is
// comfortable for a 2G upload attempt and unforgivably short for an
// attacker who exfiltrated one.
const DefaultPutTTL = 5 * time.Minute

// DefaultMaxPhotoBytes caps what a single URL can accept (15 MB covers
// modern phone HDR photos with margin; videos are a future RPC of their
// own).
const DefaultMaxPhotoBytes = 15 << 20

// Presigner mints signed PUT URLs. Construct once at boot; it is safe for
// concurrent use (the underlying S3 client is).
type Presigner struct {
	presign  *s3.PresignClient
	bucket   string
	putTTL   time.Duration
	maxBytes int64
}

// NewPresigner builds a presigner from R2_* config values. It performs no
// network I/O — signing is pure local cryptography (SigV4), so a
// misconfigured bucket only fails when a URL is actually used, and tests
// can construct presigners with dummy credentials offline.
func NewPresigner(cfg config.Config) *Presigner {
	// R2's S3-compatible endpoint is account-scoped:
	// https://<account-id>.r2.cloudflarestorage.com
	// Region "auto" is R2's convention.
	awsCfg := aws.Config{
		Region:       "auto",
		Credentials:  credentials.NewStaticCredentialsProvider(cfg.R2AccessKeyID, cfg.R2SecretAccessKey, ""),
		BaseEndpoint: aws.String("https://" + cfg.R2AccountID + ".r2.cloudflarestorage.com"),
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true // R2 requires path-style addressing
	})
	return &Presigner{
		presign:  s3.NewPresignClient(client),
		bucket:   cfg.R2Bucket,
		putTTL:   cfg.PhotoPutTTL,
		maxBytes: cfg.PhotoMaxBytes,
	}
}

// ObjectKey builds the server-controlled storage key:
// photos/{projectID}/{stationID|unfiled}/{uuid}{ext}
//
// The shape mirrors the data model (photos belong to a station) which
// makes lifecycle rules and bucket browsing sane later.
func ObjectKey(projectID, stationID, extension string) string {
	scope := stationID
	if scope == "" {
		scope = "unfiled"
	}
	return path.Join("photos", projectID, scope, uuid.NewString()+extension)
}

// CreateUploadURL validates the request and returns (uploadURL, key, expiry).
// Errors are connect-style sentinel values the RPC handler maps to codes.
func (p *Presigner) CreateUploadURL(
	ctx context.Context,
	projectID, stationID, fileName, contentType string, contentLength int64,
) (string, string, time.Time, error) {
	ext, ok := allowedContentTypes[contentType]
	if !ok {
		return "", "", time.Time{}, fmt.Errorf(
			"content type %q not allowed (want one of: image/jpeg, image/png, image/webp, image/heic)", contentType)
	}

	// NOTE: the file name contributes NOTHING to the key — the extension
	// comes from the allowlisted content type, because that is what the
	// presign signature pins. A "photo.jpg" declared as image/png becomes
	// .png; a name with slashes/unicode changes nothing.

	if contentLength <= 0 {
		return "", "", time.Time{}, fmt.Errorf("content_length_bytes must be positive")
	}
	if contentLength > p.maxBytes {
		return "", "", time.Time{}, fmt.Errorf(
			"photo is %d bytes; maximum is %d", contentLength, p.maxBytes)
	}

	key := ObjectKey(projectID, stationID, ext)

	// PresignPutObject is a LOCAL operation (no network): it produces the
	// signed URL deterministically from the credentials and clock.
	req, err := p.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(p.bucket),
		Key:           aws.String(key),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(contentLength),
	}, s3.WithPresignExpires(p.putTTL))
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("presign: %w", err)
	}

	return req.URL, key, time.Now().Add(p.putTTL), nil
}
