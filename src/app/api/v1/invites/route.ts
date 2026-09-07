import { requireApiOwner } from "@/lib/current-user";
import { jsonError, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { AuthError, createInvite, getSeats, listInvites } from "@/server/auth/service";
import { createInviteSchema } from "@/server/auth/types";

/** GET -> every invite code with its status, plus how many places are left. Owner only. */
export const GET = withErrorHandling(async () => {
  await requireApiOwner();
  const [invites, seats] = await Promise.all([listInvites(), getSeats()]);
  return Response.json({ invites, seats });
});

/** POST { label? } -> mints one code, refusing to over-issue against the remaining places. */
export const POST = withErrorHandling(async (request: Request) => {
  const owner = await requireApiOwner();
  const input = await parseBody(createInviteSchema, request);
  try {
    return Response.json({ invite: await createInvite(owner.id, input) }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.status, err.message, err.details);
    throw err;
  }
});
