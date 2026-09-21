package telemetry

import (
	"fmt"
	"io"
	"log"
	"testing"
	"time"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// BenchmarkHubPublishFanout measures the latency and allocations of broadcasting
// GPS coordinates across 10 concurrent subscribers in a single mining tenement.
func BenchmarkHubPublishFanout(b *testing.B) {
	log.SetOutput(io.Discard) // Discard slow subscriber logs during high-frequency benchmark
	hub := NewHub(time.Minute, time.Minute)
	defer hub.Close()

	const projectID = "benchmark-project-alpha"
	const numSubscribers = 10

	var subs []<-chan *v1.StreamLiveTelemetryResponse
	for i := 0; i < numSubscribers; i++ {
		ch, cancel := hub.Subscribe(projectID)
		defer cancel()
		subs = append(subs, ch)
	}

	req := &v1.StreamLiveTelemetryRequest{
		ProjectId:         projectID,
		UserId:            "usr-bench-geologist",
		UserName:          "Benchmarker",
		Latitude:          3.12450,
		Longitude:         35.89210,
		Elevation:         642.5,
		Heading:           45.0,
		BatteryPercentage: 88,
	}

	// Drain goroutine to prevent channel buffer overflow during benchmark
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			default:
				for _, ch := range subs {
					select {
					case <-ch:
					default:
					}
				}
			}
		}
	}()
	defer close(done)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		req.UserId = fmt.Sprintf("usr-%d", i%20)
		hub.Publish(req)
	}
}
