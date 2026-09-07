import type { NextRequest } from "next/server";
import { requireApiOwner } from "@/lib/current-user";
import { jsonError, parseId, withErrorHandling } from "@/lib/http";
import { revokeInvite } from "@/server/auth/service";

/** DELETE -> cancels an unused code. Codes already spent stay as a record. */
export const DELETE = withErrorHandling(async (_request: NextRequest, ctx: RouteContext<"/api/v1/invites/[id]">) => {
  await requireApiOwner();
  const revoked = await revokeInvite(parseId((await ctx.params).id));
  return revoked ? new Response(null, { status: 204 }) : jsonError(404, "No unused invite with that id");
});
