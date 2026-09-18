module gitlab.com/austin4403/geoquerry/backend

// NOTE: pgx/v5 v5.11.0 declares a go 1.25 requirement, so the module must
// build with the Go 1.25 toolchain. Developers on older local Go versions
// are covered: GOTOOLCHAIN=auto (the default) fetches go1.25 automatically.
go 1.25.0

require (
	connectrpc.com/connect v1.18.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.11.0
	google.golang.org/protobuf v1.36.12
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.17.0 // indirect
	golang.org/x/text v0.29.0 // indirect
)
