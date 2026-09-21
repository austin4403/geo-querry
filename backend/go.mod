module gitlab.com/austin4403/geoquerry/backend

// NOTE: pgx/v5 v5.11.0 declares a go 1.25 requirement, so the module must
// build with the Go 1.25 toolchain. Developers on older local Go versions
// are covered: GOTOOLCHAIN=auto (the default) fetches go1.25 automatically.
go 1.26.0

toolchain go1.26.8

require (
	connectrpc.com/connect v1.18.1
	github.com/aws/aws-sdk-go-v2 v1.47.0
	github.com/aws/aws-sdk-go-v2/credentials v1.20.5
	github.com/aws/aws-sdk-go-v2/service/s3 v1.113.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.11.0
	golang.org/x/net v0.55.0
	google.golang.org/protobuf v1.36.12
)

require (
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.20 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.5.3 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.8.3 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.5.3 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.19 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.11.3 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.14.3 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.20.3 // indirect
	github.com/aws/smithy-go v1.28.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/riverqueue/river v0.47.0 // indirect
	github.com/riverqueue/river/riverdriver v0.47.0 // indirect
	github.com/riverqueue/river/riverdriver/riverpgxv5 v0.47.0 // indirect
	github.com/riverqueue/river/rivershared v0.47.0 // indirect
	github.com/riverqueue/river/rivertype v0.47.0 // indirect
	github.com/tidwall/gjson v1.19.0 // indirect
	github.com/tidwall/match v1.2.0 // indirect
	github.com/tidwall/pretty v1.2.1 // indirect
	github.com/tidwall/sjson v1.2.5 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.41.0 // indirect
)
