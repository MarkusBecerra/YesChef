import { withErrorHandling } from "@/lib/http";
import { listTags } from "@/server/tags/service";

/** GET /api/v1/tags -> every tag in use with its recipe count. */
export const GET = withErrorHandling(async () => Response.json({ tags: await listTags() }));
