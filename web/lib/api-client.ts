import { getSession } from "./session";
import { createInternalAssertion } from "./assertion";

const BACKEND_URL =
  process.env.GEOQUERRY_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

export async function callBackendRPC<TReq, TRes>(
  procedure: string,
  req: TReq
): Promise<TRes> {
  const session = await getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
  };

  if (session) {
    const assertion = createInternalAssertion({
      sub: session.userId,
      authTime: session.authTime,
      sudoExpiresAt: session.sudoExpiresAt,
    });
    headers["Authorization"] = `Bearer ${assertion}`;
  }

  if (process.env.GEOQUERRY_API_KEY) {
    headers["X-Geoquerry-Api-Key"] = process.env.GEOQUERRY_API_KEY;
  }

  const url = `${BACKEND_URL.replace(/\/$/, "")}/${procedure.replace(/^\//, "")}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let message = `Backend RPC error (${res.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.message) {
        message = parsed.message;
      }
    } catch {
      // Use fallback status message
    }
    throw new Error(message);
  }

  return (await res.json()) as TRes;
}
