/**
 * GeoQuerry Web Client API
 * Type-safe client bindings for Go backend ConnectRPC & BFF endpoints.
 */

export interface ConcessionDTO {
  id: string;
  projectId: string;
  code: string;
  name: string;
  licenseType: string;
  areaHa: number;
  status: "ACTIVE" | "RENEWAL_DUE" | "PENDING";
  validUntil: string;
  coordinates: [number, number][]; // [longitude, latitude] pairs in EPSG:4326
}

export interface StructuralMeasurementDTO {
  id: string;
  stationId: string;
  stationCode: string;
  strike: number; // 0..360
  dip: number;    // 0..90
  trend?: number;
  plunge?: number;
  feature: string;
  formation: string;
  coordinates: [number, number]; // [longitude, latitude]
}

export interface TelemetryTicketResponse {
  ticket: string;
  expiresInSeconds: number;
  streamUrl: string;
}

export interface MpesaCheckoutRequest {
  phoneNumber: string;
  amount: number;
  planId: string;
  accountReference: string;
}

export interface MpesaCheckoutResponse {
  checkoutRequestId: string;
  customerMessage: string;
  status: string;
}

export interface StripeCheckoutRequest {
  planId: string;
  minorUnits: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

/**
 * Fetch concessions list from the BFF/Backend
 */
export async function getConcessions(): Promise<ConcessionDTO[]> {
  const res = await fetch("/api/concessions", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    // Return sample fallbacks if offline or unauthenticated
    return [
      {
        id: "conc-001",
        projectId: "proj-turkana",
        code: "PL-2024-0012",
        name: "Kitui South Lithium Perimeter",
        licenseType: "Prospecting License",
        areaHa: 14250,
        status: "ACTIVE",
        validUntil: "2028-11-15",
        coordinates: [
          [38.10, -1.25],
          [38.35, -1.25],
          [38.35, -1.50],
          [38.10, -1.50],
          [38.10, -1.25],
        ],
      },
      {
        id: "conc-002",
        projectId: "proj-turkana",
        code: "ML-2022-0045",
        name: "Turkana Rare Earth Block B",
        licenseType: "Mining Lease",
        areaHa: 4800,
        status: "ACTIVE",
        validUntil: "2032-06-30",
        coordinates: [
          [35.80, 3.10],
          [36.05, 3.10],
          [36.05, 3.35],
          [35.80, 3.35],
          [35.80, 3.10],
        ],
      },
      {
        id: "conc-003",
        projectId: "proj-turkana",
        code: "SPL-2025-0108",
        name: "Migori Gold Belt Sector 4",
        licenseType: "Special Prospecting License",
        areaHa: 8900,
        status: "RENEWAL_DUE",
        validUntil: "2026-10-31",
        coordinates: [
          [34.30, -0.95],
          [34.60, -0.95],
          [34.60, -1.15],
          [34.30, -1.15],
          [34.30, -0.95],
        ],
      },
    ];
  }
  return res.json();
}

/**
 * Mint a scoped, short-lived ticket to connect to the Go live telemetry SSE stream
 */
export async function getTelemetryTicket(): Promise<TelemetryTicketResponse> {
  const res = await fetch("/api/telemetry/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to mint telemetry ticket: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Initiate M-Pesa STK push via BFF
 */
export async function initiateMpesaSTK(req: MpesaCheckoutRequest): Promise<MpesaCheckoutResponse> {
  const res = await fetch("/api/billing/mpesa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `M-Pesa initiation failed: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Initiate Stripe checkout via BFF
 */
export async function initiateStripeCheckout(req: StripeCheckoutRequest): Promise<StripeCheckoutResponse> {
  const res = await fetch("/api/billing/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Stripe checkout initiation failed: ${res.statusText}`);
  }
  return res.json();
}
