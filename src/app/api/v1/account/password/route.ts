import { requireApiUser, setSessionCookie } from "@/lib/current-user";
import { jsonError, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { AuthError, changePassword } from "@/server/auth/service";
import { createSessionToken } from "@/server/auth/session";
import { changePasswordSchema } from "@/server/auth/types";

/**
 * POST { currentPassword, newPassword }. Every other session is signed out by the bump to
 * the account's token version, so this one gets a freshly signed cookie back.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  const input = await parseBody(changePasswordSchema, request);
  try {
    const tokenVersion = await changePassword(user.id, input);
    const token = await createSessionToken({ userId: user.id, tokenVersion });
    await setSessionCookie(token);
    return Response.json({ ok: true, token });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.status, err.message, err.details);
    throw err;
  }
});
