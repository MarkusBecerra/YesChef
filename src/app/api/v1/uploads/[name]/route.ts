import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/current-user";
import { jsonError, withErrorHandling } from "@/lib/http";
import { localFileName, LOCAL_UPLOADS_ROUTE } from "@/server/storage/local";
import { contentTypeFor } from "@/server/storage/types";

/** Serves photos stored on local disk (development / self-hosting). Vercel Blob serves its own URLs. */
export const GET = withErrorHandling(async (_request: NextRequest, ctx: RouteContext<"/api/v1/uploads/[name]">) => {
  // The proxy checks the token's signature but can't reach the database, so a session that
  // was revoked (a password change) would keep working here without this second check.
  await requireApiUser();
  const { name: raw } = await ctx.params;
  const name = localFileName(`${LOCAL_UPLOADS_ROUTE}/${raw}`);
  const contentType = name && contentTypeFor(name.split(".").pop() ?? "");
  if (!name || !contentType) return jsonError(404, "Not found");

  try {
    const bytes = await readFile(path.join(process.cwd(), "data", "uploads", name));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return jsonError(404, "Not found");
  }
});
