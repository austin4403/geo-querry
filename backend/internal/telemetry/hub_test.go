// hub_test.go exercises the in-memory telemetry hub: snapshot fan-out, the
// two-stage TTL expiry, and the slow-subscriber drop path. Everything is
// deterministic — sweepOnce is called directly instead of waiting on the
// background reaper's ticker.
package telemetry

import (
	"testing"
	"time"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

const projA = "11111111-1111-1111-1111-111111111111"
const projB = "22222222-2222-2222-2222-222222222222"

func point(project, user string) *v1.StreamLiveTelemetryRequest {
	return &v1.StreamLiveTelemetryRequest{
		ProjectId: project,
		UserId:    user,
		UserName:  "Geo " + user,
		Latitude:  -1.482,
		Longitude: 37.056,
	}
}

// recv waits for one snapshot with a hard deadline so a bug fails the test
// instead of hanging CI.
func recv(t *testing.T, ch <-chan *v1.StreamLiveTelemetryResponse) *v1.StreamLiveTelemetryResponse {
	t.Helper()
	select {
	case snap := <-ch:
		return snap
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for a telemetry snapshot")
		return nil
	}
}

// TestPublishFansOutToProjectSubscribers checks the core contract: a point
// from one device becomes a snapshot on every stream of that project — and
// does NOT leak to other projects.
func TestPublishFansOutToProjectSubscribers(t *testing.T) {
	hub := NewHub(time.Minute, time.Minute) // TTL long enough to never fire
	defer hub.Close()

	chA1, cancelA1 := hub.Subscribe(projA)
	defer cancelA1()
	chA2, cancelA2 := hub.Subscribe(projA)
	defer cancelA2()
	chB, cancelB := hub.Subscribe(projB)
	defer cancelB()

	hub.Publish(point(projA, "u1"))

	snap1 := recv(t, chA1)
	snap2 := recv(t, chA2)
	if len(snap1.Members) != 1 || snap1.Members[0].GetUserId() != "u1" {
		t.Fatalf("first subscriber got %+v", snap1)
	}
	if snap2.GetProjectId() != projA || len(snap2.Members) != 1 {
		t.Fatalf("second subscriber got %+v", snap2)
	}
	if !snap1.Members[0].GetIsActive() {
		t.Fatal("fresh member must be active")
	}

	select {
	case snap := <-chB:
		t.Fatalf("project B received a snapshot from project A: %+v", snap)
	case <-time.After(50 * time.Millisecond):
		// correct: nothing should arrive
	}
}

// TestMemberOverwriteNotAppend pins the "hub stores only now" rule: the
// same user publishing twice yields ONE member with the LATEST coordinates.
func TestMemberOverwriteNotAppend(t *testing.T) {
	hub := NewHub(time.Minute, time.Minute)
	defer hub.Close()

	ch, cancel := hub.Subscribe(projA)
	defer cancel()

	p1 := point(projA, "u1")
	p1.Latitude = -1.0
	hub.Publish(p1)
	recv(t, ch)

	p2 := point(projA, "u1")
	p2.Latitude = -2.0
	hub.Publish(p2)
	snap := recv(t, ch)

	if len(snap.Members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(snap.Members))
	}
	if got := snap.Members[0].GetLatitude(); got != -2.0 {
		t.Fatalf("stale coordinates: got %v, want -2.0", got)
	}
}

// TestSweepMarksInactiveThenForgets covers both expiry stages:
// silent > ttl greys the member out (broadcast with IsActive=false),
// silent > 4*ttl removes them from snapshots entirely.
func TestSweepMarksInactiveThenForgets(t *testing.T) {
	ttl := 40 * time.Millisecond
	hub := NewHub(ttl, ttl) // reaper cadence irrelevant: we sweep manually
	defer hub.Close()

	ch, cancel := hub.Subscribe(projA)
	defer cancel()

	hub.Publish(point(projA, "u1"))
	active := recv(t, ch)
	if !active.Members[0].GetIsActive() {
		t.Fatal("member should start active")
	}

	// Stage 1: silent past ttl -> inactive, but still listed.
	time.Sleep(2 * ttl)
	hub.sweepOnce()
	greyed := recv(t, ch)
	if len(greyed.Members) != 1 || greyed.Members[0].GetIsActive() {
		t.Fatalf("member should be greyed out, got %+v", greyed.Members)
	}

	// Stage 2: silent past 4*ttl -> forgotten entirely.
	time.Sleep(4 * ttl)
	hub.sweepOnce()
	gone := recv(t, ch)
	if len(gone.Members) != 0 {
		t.Fatalf("member should have been forgotten, got %+v", gone.Members)
	}
}

// TestSlowSubscriberDoesNotBlock proves deliverLocked's non-blocking send:
// a subscriber that never drains must not stall the publisher, which would
// otherwise freeze telemetry for the whole team.
func TestSlowSubscriberDoesNotBlock(t *testing.T) {
	hub := NewHub(time.Minute, time.Minute)
	defer hub.Close()

	// Subscribe but NEVER read from chSlow — its 64-slot buffer will fill.
	chSlow, cancelSlow := hub.Subscribe(projA)
	defer cancelSlow()
	_ = chSlow
	chLive, cancelLive := hub.Subscribe(projA)
	defer cancelLive()

	// Publish well beyond the slow subscriber's buffer capacity.
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 200; i++ {
			hub.Publish(point(projA, "u1"))
		}
	}()

	select {
	case <-done:
		// publisher finished despite the wedged subscriber
	case <-time.After(2 * time.Second):
		t.Fatal("publisher blocked on a slow subscriber")
	}

	// The healthy subscriber still receives the latest state.
	snap := recv(t, chLive)
	if len(snap.Members) != 1 {
		t.Fatalf("healthy subscriber lost data: %+v", snap)
	}
}
