import { jsonError, withErrorHandling } from "@/lib/http";
import { setSessionCookie } from "@/lib/current-user";
import { parseBody } from "@/lib/validate";
import { AuthError, signUp } from "@/server/auth/service";
import { createSessionToken, getAuthSecret } from "@/server/auth/session";
import { signUpSchema } from "@/server/auth/types";

/**
 * POST { name, email, password, inviteCode } -> creates the account, signs it in.
 * The first account ever created is the owner and needs the server's setup code.
 */
export const POST = withErrorHandling(async (request: Request) => {
  if (!getAuthSecret()) return jsonError(503, "AUTH_SECRET is not configured on the server");

  const input = await parseBody(signUpSchema, request);
  try {
    const { account, tokenVersion, claimedRecipes } = await signUp(input);
    const token = await createSessionToken({ userId: account.id, tokenVersion });
    await setSessionCookie(token);
    return Response.json({ ok: true, token, user: account, claimedRecipes }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.status, err.message, err.details);
    throw err;
  }
});
