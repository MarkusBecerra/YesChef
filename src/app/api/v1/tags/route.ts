import { requireApiUser } from "@/lib/current-user";
import { withErrorHandling } from "@/lib/http";
import { listTags } from "@/server/tags/service";

/** GET /api/v1/tags -> every tag the signed-in cook uses, with its recipe count. */
export const GET = withErrorHandling(async () => {
  const user = await requireApiUser();
  return Response.json({ tags: await listTags(user.id) });
});
