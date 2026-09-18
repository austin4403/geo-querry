// Package telemetry implements the live team-tracking half of the backend:
// field devices stream GPS breadcrumbs in, the web portal receives real-time
// snapshots of where every geologist on a project is.
//
// WHY IN-MEMORY (AND WHEN TO OUTGROW IT)
// The design doc plans Upstash Redis pub/sub for telemetry. For v1 the hub
// below is a plain in-process map — with ONE Koyeb instance (our deployment
// model) every stream lands in the same process anyway, and Redis would add
// a network hop and a 10k-commands/day cap for zero benefit. The Hub's
// Publish/Subscribe surface is deliberately shaped like a Redis pub/sub
// channel, so swapping in the Upstash client later means replacing the body
// of this file, not its callers.
//
// Telemetry is EPHEMERAL by design: nothing here touches PostGIS. The last
// known position of a teammate is useful for hours at most; persistence
// would only bloat the database.
package telemetry

import (
	"log"
	"sync"
	"time"

	v1 "gitlab.com/austin4403/geoquerry/backend/pkg/proto/geoquerry/v1"
)

// member is the hub's live record of one field device.
type member struct {
	userID    string
	userName  string
	lat, lon  float64
	elevation float64
	heading   float64
	battery   int32
	lastSeen  time.Time // last breadcrumb arrival; drives the TTL below
	active    bool      // false once silent past TTL (grey dot on the map)
}

// Hub fans telemetry out to every connected stream of the same project.
//
// Concurrency model: one mutex guards both maps. Contention is a non-issue
// (a field team is tens of devices, updates every few seconds), so a
// RWMutex would be premature complexity.
type Hub struct {
	mu sync.Mutex
	// projectID -> userID -> latest state. One map entry per device,
	// overwritten on every breadcrumb — the hub stores only "now".
	members map[string]map[string]*member
	// projectID -> set of subscriber channels (one per connected stream).
	subs map[string]map[chan *v1.StreamLiveTelemetryResponse]struct{}

	ttl          time.Duration // silence before a member is marked inactive
	sweepEvery   time.Duration // how often the reaper looks for silent members
	sweepStop    chan struct{} // closed by Close to stop the reaper goroutine
	sweepStopped sync.WaitGroup
}

// NewHub creates a hub and starts its background reaper.
//
//   - ttl: silence after which a geologist shows as inactive on the map
//     (they may be in a ravine with a flaky GPS — not gone).
//   - sweepEvery: reaper cadence; roughly ttl/4 is a good default so the
//     inactive transition appears within ~25% of the TTL.
func NewHub(ttl, sweepEvery time.Duration) *Hub {
	h := &Hub{
		members:    make(map[string]map[string]*member),
		subs:       make(map[string]map[chan *v1.StreamLiveTelemetryResponse]struct{}),
		ttl:        ttl,
		sweepEvery: sweepEvery,
		sweepStop:  make(chan struct{}),
	}
	h.sweepStopped.Add(1)
	go h.reapLoop()
	return h
}

// Close stops the reaper goroutine. Safe to call once, at server shutdown.
func (h *Hub) Close() {
	close(h.sweepStop)
	h.sweepStopped.Wait()
}

// Publish ingests one breadcrumb: it refreshes the member's state and
// immediately pushes a fresh project snapshot to every subscriber.
func (h *Hub) Publish(p *v1.StreamLiveTelemetryRequest) {
	h.mu.Lock()
	defer h.mu.Unlock()

	proj, ok := h.members[p.GetProjectId()]
	if !ok {
		proj = make(map[string]*member)
		h.members[p.GetProjectId()] = proj
	}
	m, ok := proj[p.GetUserId()]
	if !ok {
		m = &member{userID: p.GetUserId()}
		proj[p.GetUserId()] = m
	}
	m.userName = p.GetUserName()
	m.lat = p.GetLatitude()
	m.lon = p.GetLongitude()
	m.elevation = p.GetElevation()
	m.heading = p.GetHeading()
	m.battery = p.GetBatteryPercentage()
	m.lastSeen = time.Now()
	m.active = true

	h.broadcastLocked(p.GetProjectId())
}

// Subscribe registers a listener for one project's snapshots.
// The returned cancel MUST be called when the stream ends (defer it) or the
// channel leaks in the subs map forever.
func (h *Hub) Subscribe(projectID string) (<-chan *v1.StreamLiveTelemetryResponse, func()) {
	// Buffer 64 snapshots: telemetry arrives every few seconds, so 64
	// covers a slow consumer for minutes. On overflow we DROP (see
	// deliverLocked) — a lagging client catching up on the latest snapshot
	// beats blocking the publisher.
	ch := make(chan *v1.StreamLiveTelemetryResponse, 64)

	h.mu.Lock()
	if h.subs[projectID] == nil {
		h.subs[projectID] = make(map[chan *v1.StreamLiveTelemetryResponse]struct{})
	}
	h.subs[projectID][ch] = struct{}{}
	h.mu.Unlock()

	cancel := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if set, ok := h.subs[projectID]; ok {
			delete(set, ch)
			if len(set) == 0 {
				delete(h.subs, projectID)
			}
		}
	}
	return ch, cancel
}

// broadcastLocked builds and delivers a snapshot. Caller must hold h.mu —
// building and delivering atomically guarantees subscribers never see a
// torn state (member list from before, coordinates from after).
func (h *Hub) broadcastLocked(projectID string) {
	snap := &v1.StreamLiveTelemetryResponse{
		ProjectId: projectID,
	}
	for _, m := range h.members[projectID] {
		snap.Members = append(snap.Members, &v1.TeamMemberLocation{
			UserId:            m.userID,
			UserName:          m.userName,
			Latitude:          m.lat,
			Longitude:         m.lon,
			Elevation:         m.elevation,
			Heading:           m.heading,
			BatteryPercentage: m.battery,
			LastSeenAt:        m.lastSeen.UnixMilli(),
			IsActive:          m.active,
		})
	}
	for ch := range h.subs[projectID] {
		deliverLocked(ch, snap)
	}
}

// deliverLocked sends without ever blocking the publisher.
func deliverLocked(ch chan *v1.StreamLiveTelemetryResponse, snap *v1.StreamLiveTelemetryResponse) {
	select {
	case ch <- snap:
	default:
		// Subscriber is >64 snapshots behind — almost certainly a wedged
		// connection whose handler will notice and disconnect. Drop rather
		// than stall every OTHER member's updates.
		log.Printf("telemetry: slow subscriber, dropping snapshot for project %s", snap.GetProjectId())
	}
}

// reapLoop marks silent members inactive and eventually forgets them.
//
// Two-stage expiry:
//   - silent > ttl        -> active=false (broadcast: greys the map dot)
//   - silent > 4*ttl      -> deleted outright, so a project with everyone
//     back at camp converges to an empty map instead of a graveyard of
//     stale dots.
func (h *Hub) reapLoop() {
	defer h.sweepStopped.Done()
	ticker := time.NewTicker(h.sweepEvery)
	defer ticker.Stop()

	for {
		select {
		case <-h.sweepStop:
			return
		case <-ticker.C:
			h.sweepOnce()
		}
	}
}

// sweepOnce is one reaper pass, split out so tests can drive it directly.
func (h *Hub) sweepOnce() {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	for projectID, proj := range h.members {
		changed := false
		for id, m := range proj {
			silent := now.Sub(m.lastSeen)
			switch {
			case silent > 4*h.ttl:
				delete(proj, id) // long gone: forget entirely
				changed = true
			case silent > h.ttl && m.active:
				m.active = false // silent a while: grey them out
				changed = true
			}
		}
		if len(proj) == 0 {
			// Last member forgotten: drop the project bucket. Do NOT skip
			// the broadcast below — subscribers are owed the final
			// empty-team snapshot.
			delete(h.members, projectID)
		}
		// Only re-broadcast when something actually transitioned — a
		// ticker-driven snapshot every few seconds would be pure noise.
		// broadcastLocked tolerates a missing project bucket and emits an
		// empty members list, which is exactly the desired final state.
		if changed {
			h.broadcastLocked(projectID)
		}
	}
}
