/**
 * GeoQuerry Live Telemetry Stream Subscriber
 * Provides resilient Server-Sent Events (SSE) / stream subscription
 * with reconnection handling, heartbeat detection, and event listener dispatch.
 */

export interface TelemetryEvent {
  memberId: string;
  name: string;
  role: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  headingDegrees: number;
  speedMps: number;
  batteryPercentage: number;
  accuracyMeters: number;
  sosAlert: boolean;
  updatedAt: number; // Unix timestamp ms
}

export type TelemetryListener = (event: TelemetryEvent) => void;
export type ConnectionStatusListener = (status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR") => void;

export class TelemetrySubscriber {
  private eventSource: EventSource | null = null;
  private listeners: Set<TelemetryListener> = new Set();
  private statusListeners: Set<ConnectionStatusListener> = new Set();
  private retryAttempts = 0;
  private maxRetries = 5;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;

  constructor(private endpointUrl: string) {}

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onStatusChange(listener: ConnectionStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public connect(ticket?: string): void {
    if (typeof window === "undefined") return;
    this.isDisposed = false;
    this.notifyStatus("CONNECTING");

    try {
      const url = new URL(this.endpointUrl, window.location.origin);
      if (ticket) {
        url.searchParams.set("ticket", ticket);
      }

      this.eventSource = new EventSource(url.toString());

      this.eventSource.onopen = () => {
        this.retryAttempts = 0;
        this.notifyStatus("CONNECTED");
      };

      this.eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as TelemetryEvent;
          this.notifyListeners(payload);
        } catch {
          // Ignore parse errors on heartbeat ping comments
        }
      };

      this.eventSource.onerror = () => {
        this.notifyStatus("ERROR");
        this.reconnect(ticket);
      };
    } catch {
      this.notifyStatus("ERROR");
      this.reconnect(ticket);
    }
  }

  public disconnect(): void {
    this.isDisposed = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.notifyStatus("DISCONNECTED");
  }

  private reconnect(ticket?: string): void {
    if (this.isDisposed) return;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.retryAttempts < this.maxRetries) {
      this.retryAttempts++;
      const backoffMs = Math.min(1000 * Math.pow(2, this.retryAttempts), 10000);
      this.retryTimeout = setTimeout(() => {
        this.connect(ticket);
      }, backoffMs);
    } else {
      this.notifyStatus("DISCONNECTED");
    }
  }

  private notifyListeners(event: TelemetryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Suppress listener callback errors
      }
    }
  }

  private notifyStatus(status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR"): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Suppress listener callback errors
      }
    }
  }
}
