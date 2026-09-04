import { cookies } from "next/headers";
import {
  createSessionToken,
  getConfiguredPassphrase,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyPassphrase,
} from "@/server/auth/session";
import { jsonError, readJson, withErrorHandling } from "@/lib/http";

/**
 * POST { passphrase } -> sets the session cookie and returns the token so a
 * native client can send it as `Authorization: Bearer <token>` instead.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const configured = getConfiguredPassphrase();
  if (!configured) return jsonError(503, "APP_PASSPHRASE is not configured on the server");

  const body = await readJson<{ passphrase?: unknown }>(request);
  const candidate = typeof body.passphrase === "string" ? body.passphrase : "";

  if (!(await verifyPassphrase(candidate))) {
    // Slow down brute force a little; there is only one credential to guess.
    await new Promise((r) => setTimeout(r, 750));
    return jsonError(401, "Wrong passphrase");
  }

  const token = await createSessionToken(configured);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return Response.json({ ok: true, token });
});
