import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/current-user";
import { jsonError, parseId, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { addCookLog } from "@/server/cooks/service";
import { cookLogInputSchema } from "@/server/recipes/types";

/** POST { cookedOn?, rating?, notes? } -> logs a cook against the recipe. */
export const POST = withErrorHandling(async (request: NextRequest, ctx: RouteContext<"/api/v1/recipes/[id]/cooks">) => {
  const user = await requireApiUser();
  const id = parseId((await ctx.params).id);
  const input = await parseBody(cookLogInputSchema, request);
  const cookLog = await addCookLog(user.id, id, input);
  return cookLog ? Response.json({ cookLog }, { status: 201 }) : jsonError(404, "Recipe not found");
});
