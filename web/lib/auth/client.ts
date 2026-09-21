"use client";

export interface SignInEmailOptions {
  email: string;
  password?: string;
  callbackUrl?: string;
}

export interface SignInSocialOptions {
  provider: "github" | "google" | "microsoft";
  callbackUrl?: string;
}

export const authClient = {
  signIn: {
    email: async (options: SignInEmailOptions) => {
      try {
        const res = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: options.email,
            password: options.password,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            error: { message: data.error || "Authentication failed" },
            data: null,
          };
        }

        const data = await res.json();
        return { data, error: null };
      } catch (err: unknown) {
        return {
          error: { message: err instanceof Error ? err.message : "Network error" },
          data: null,
        };
      }
    },

    social: async (options: SignInSocialOptions) => {
      // In production Neon Auth with OAuth providers configured, this initiates OAuth redirect
      const callbackUrl = options.callbackUrl || "/dashboard";
      window.location.href = `/api/auth/sign-in/social?provider=${options.provider}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
    },
  },

  signOut: async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  },

  getSession: async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (!res.ok) return { data: null };
      const data = await res.json();
      return { data };
    } catch {
      return { data: null };
    }
  },
};
