"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Vanilla Neon Auth client. Talks to the same-origin /api/auth handler,
 * which proxies to the Neon Auth (Managed Better Auth) API.
 * See: https://neon.com/docs/auth/overview
 */
export const authClient = createAuthClient();
