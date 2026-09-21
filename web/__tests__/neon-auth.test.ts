import { describe, it, expect, vi, beforeEach } from "vitest";
import { authClient } from "@/lib/auth/client";

describe("Neon Auth Client Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("successfully calls Neon Auth email sign-in endpoint", async () => {
    const mockResponse = {
      success: true,
      user: { id: "usr_chief_geologist", email: "chief.geologist@geoquerry.local" },
      session: { id: "sess_123", expiresAt: "2026-10-06T00:00:00.000Z" },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await authClient.signIn.email({
      email: "chief.geologist@geoquerry.local",
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/sign-in/email", expect.objectContaining({
      method: "POST",
    }));
    expect(result.error).toBeNull();
    expect(result.data).toEqual(mockResponse);
  });

  it("handles authentication failures gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invalid credentials" }),
    });

    const result = await authClient.signIn.email({
      email: "unknown@geoquerry.local",
      password: "wrong",
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Invalid credentials");
  });
});
