// Test environment for modules that construct the Neon Auth server SDK at
// import time (proxy.ts -> lib/auth/server.ts). Values are placeholders; the
// SDK only validates the cookie secret's length at construction.
process.env.NEON_AUTH_BASE_URL ||= "https://ep-test-pooler.neonauth.us-east-1.aws.neon.tech/neondb/auth";
process.env.NEON_AUTH_COOKIE_SECRET ||= "vitest-cookie-secret-0123456789abcdef0123456789abcdef";
