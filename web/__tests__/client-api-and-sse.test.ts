// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TelemetrySubscriber, TelemetryEvent } from "../lib/sse";

describe("TelemetrySubscriber", () => {
  let originalEventSource: typeof global.EventSource;

  beforeEach(() => {
    originalEventSource = global.EventSource;
  });

  afterEach(() => {
    global.EventSource = originalEventSource;
  });

  it("registers event listeners and dispatches telemetry points", () => {
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    let closed = false;

    class MockEventSource {
      url: string;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set onmessage(handler: (event: MessageEvent) => void) {
        messageHandler = handler;
      }

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          this.onopen?.();
        }, 10);
      }

      close() {
        closed = true;
      }
    }

    // @ts-expect-error - mock EventSource
    global.EventSource = MockEventSource;
    // @ts-expect-error - mock window EventSource
    window.EventSource = MockEventSource;

    const subscriber = new TelemetrySubscriber("/api/telemetry/stream");
    const receivedPoints: TelemetryEvent[] = [];

    const unsubscribe = subscriber.subscribe((point) => {
      receivedPoints.push(point);
    });

    subscriber.connect("ticket-abc");

    // Simulate incoming telemetry message
    const samplePayload: TelemetryEvent = {
      memberId: "usr-42",
      name: "Dr. Stone",
      role: "Lead Geologist",
      latitude: -1.286389,
      longitude: 36.817223,
      altitudeMeters: 1661,
      headingDegrees: 180,
      speedMps: 1.2,
      batteryPercentage: 92,
      accuracyMeters: 3.5,
      sosAlert: false,
      updatedAt: Date.now(),
    };

    if (messageHandler) {
      (messageHandler as (event: MessageEvent) => void)({
        data: JSON.stringify(samplePayload),
      } as MessageEvent);
    }

    expect(receivedPoints.length).toBe(1);
    expect(receivedPoints[0]).toMatchObject({
      memberId: "usr-42",
      batteryPercentage: 92,
    });

    unsubscribe();
    subscriber.disconnect();
    expect(closed).toBe(true);
  });
});
