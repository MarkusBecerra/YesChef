import { jsonError, withErrorHandling } from "@/lib/http";
import { setSessionCookie } from "@/lib/current-user";
import { parseBody } from "@/lib/validate";
import { signIn } from "@/server/auth/service";
import { createSessionToken, getAuthSecret } from "@/server/auth/session";
import { signInSchema } from "@/server/auth/types";

/**
 * POST { email, password } -> sets the session cookie and returns the token so a
 * native client can send it as `Authorization: Bearer <token>` instead.
 */
export const POST = withErrorHandling(async (request: Request) => {
  if (!getAuthSecret()) return jsonError(503, "AUTH_SECRET is not configured on the server");

  const input = await parseBody(signInSchema, request);
  const result = await signIn(input);
  if (!result) {
    // Hashing already costs a fraction of a second; this just rounds off the difference
    // between "no such account" and "wrong password".
    await new Promise((r) => setTimeout(r, 400));
    return jsonError(401, "Wrong email or password");
  }

  const token = await createSessionToken({ userId: result.account.id, tokenVersion: result.tokenVersion });
  await setSessionCookie(token);
  return Response.json({ ok: true, token, user: result.account });
});
