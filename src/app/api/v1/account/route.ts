import { requireApiUser } from "@/lib/current-user";
import { jsonError, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { AuthError, updateProfile } from "@/server/auth/service";
import { updateProfileSchema } from "@/server/auth/types";

/** PATCH { name?, email? } -> updates the signed-in account. */
export const PATCH = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  const input = await parseBody(updateProfileSchema, request);
  try {
    return Response.json({ user: await updateProfile(user.id, input) });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.status, err.message, err.details);
    throw err;
  }
});
