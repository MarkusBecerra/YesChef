import type { NextRequest } from "next/server";
import { jsonError, parseId, withErrorHandling } from "@/lib/http";
import { parseBody } from "@/lib/validate";
import { deleteCookLog, updateCookLog } from "@/server/cooks/service";
import { cookLogInputSchema } from "@/server/recipes/types";

type Ctx = RouteContext<"/api/v1/cooks/[id]">;

export const PATCH = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  const id = parseId((await ctx.params).id);
  const input = await parseBody(cookLogInputSchema, request);
  const cookLog = await updateCookLog(id, input);
  return cookLog ? Response.json({ cookLog }) : jsonError(404, "Cook log not found");
});

export const DELETE = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const deleted = await deleteCookLog(parseId((await ctx.params).id));
  return deleted ? new Response(null, { status: 204 }) : jsonError(404, "Cook log not found");
});
