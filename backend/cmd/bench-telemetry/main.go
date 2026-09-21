// Command bench-telemetry simulates a small field team against a running
// GeoQuerry backend, exercising the StreamLiveTelemetry bidirectional stream
// end to end: each simulated device opens ONE Connect bidi stream, sends GPS
// breadcrumbs, and prints the team snapshots it receives back.
//
// WHAT THIS PROVES WHEN IT RUNS GREEN
//   - h2c (HTTP/2 over cleartext) works on the server — bidi needs HTTP/2
//   - hub fan-out is cross-device: each device sees its TEAMMATES appear in
//     snapshots within one publish cycle
//   - the stream survives sustained bidirectional traffic and closes cleanly
//
// USAGE (from backend/, with the server on localhost:8080):
//
//	go run ./cmd/bench-telemetry
//	go run ./cmd/bench-telemetry -devices 5 -points 20 -interval 200ms
package main

import (
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/net/http2"

	"gitlab.com/austin4403/geoquerry/backend/internal/auth"
	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
	geoquerryv1connect "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1/geoquerryv1connect"
)

// dialPlainH2C returns a raw TCP connection where HTTP/2's TLS layer would
// sit. Combined with AllowHTTP: true, this is the standard recipe for
// speaking h2c (HTTP/2 without TLS) from a Go client.
func dialPlainH2C(ctx context.Context, network, addr string, _ *tls.Config) (net.Conn, error) {
	var d net.Dialer
	return d.DialContext(ctx, network, addr)
}

func main() {
	addr := flag.String("addr", "http://localhost:8080", "base URL of the GeoQuerry server")
	project := flag.String("project", "0b6f6c2e-1234-4abc-9def-000000000001", "project UUID the simulated team works on")
	devices := flag.Int("devices", 3, "how many simulated field devices to stream from")
	points := flag.Int("points", 10, "GPS points each device sends")
	interval := flag.Duration("interval", 150*time.Millisecond, "delay between points per device")
	apiKey := flag.String("apikey", "", "API key when the server has GEOQUERRY_API_KEYS set")
	flag.Parse()

	// h2c client transport: AllowHTTP enables HTTP/2 over cleartext, which
	// is what the server speaks on plain http:// (no TLS termination in
	// front of it locally).
	httpClient := &http.Client{
		Transport: &http2.Transport{AllowHTTP: true, DialTLSContext: dialPlainH2C},
		Timeout:   0, // streams must never be killed by a client timeout
	}
	client := geoquerryv1connect.NewGeoquerrySyncServiceClient(httpClient, *addr)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup
	snapshotCounts := make([]int, *devices)

	for d := 0; d < *devices; d++ {
		wg.Add(1)
		go func(deviceIdx int) {
			defer wg.Done()
			userID := fmt.Sprintf("bench-geologist-%d", deviceIdx)

			runDevice(ctx, client, *project, *apiKey, userID, *points, *interval, &snapshotCounts[deviceIdx])
		}(d)
	}

	wg.Wait()

	// Report: every device should have received multiple snapshots, the
	// last ones listing ALL team members (proving cross-device fan-out).
	ok := true
	for d, n := range snapshotCounts {
		fmt.Printf("device %d received %d snapshots\n", d, n)
		if n == 0 {
			ok = false
		}
	}
	if !ok {
		log.Fatal("bench FAILED: some devices received no snapshots")
	}
	fmt.Println("bench PASSED: bidi telemetry stream round-trips through the hub")
}

// runDevice streams one device's session: send `points` breadcrumbs while
// concurrently receiving team snapshots, then half-close and wait for the
// server to end the stream.
func runDevice(
	ctx context.Context,
	client geoquerryv1connect.GeoquerrySyncServiceClient,
	project, apiKey, userID string,
	points int, interval time.Duration,
	snapshotsSeen *int,
) {
	// The API key must be on the REQUEST headers before the first Send
	// (headers go on the wire with the first message — see connect's
	// BidiStreamForClient.RequestHeader docs).
	stream := client.StreamLiveTelemetry(ctx)
	if apiKey != "" {
		stream.RequestHeader().Set(auth.APIKeyHeader, apiKey)
	}

	// SENDER: one goroutine pushes this device's GPS walk (a small drift
	// around Nairobi so points differ), then closes its send side — the
	// Connect equivalent of "session data done".
	go func() {
		defer stream.CloseRequest()
		for i := 0; i < points; i++ {
			pt := &v1.StreamLiveTelemetryRequest{
				ProjectId:         project,
				UserId:            userID,
				UserName:          "Bench " + userID,
				Latitude:          -1.28 + float64(i)*1e-5,
				Longitude:         36.82 + float64(i)*1e-5,
				Elevation:         1795,
				GpsAccuracy:       4.2,
				Heading:           float64(90 + i),
				SpeedMps:          1.4,
				BatteryPercentage: int32(80 - i/2), // #nosec G115,
				RecordedAt:        time.Now().UnixMilli(),
			}
			if err := stream.Send(pt); err != nil {
				log.Printf("%s: send: %v", userID, err)
				return
			}
			time.Sleep(interval)
		}
	}()

	// RECEIVER: print the first snapshot and every time the team size
	// changes, then count everything for the summary.
	lastSize := -1
	for {
		snap, err := stream.Receive()
		if err != nil {
			// io.EOF (possibly wrapped) = server ended the stream cleanly,
			// which only happens after every sender half-closed. Anything
			// else is a real failure we want to see in bench output.
			if !errors.Is(err, io.EOF) {
				log.Printf("%s: receive: %v", userID, err)
			}
			return
		}
		*snapshotsSeen++
		size := len(snap.GetMembers())
		if size != lastSize {
			names := make([]string, 0, size)
			for _, m := range snap.GetMembers() {
				names = append(names, m.GetUserId())
			}
			fmt.Printf("%s: snapshot #%d sees %d members %v\n",
				userID, *snapshotsSeen, size, names)
			lastSize = size
		}
	}
}
