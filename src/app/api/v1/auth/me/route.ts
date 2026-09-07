import { requireApiUser } from "@/lib/current-user";
import { withErrorHandling } from "@/lib/http";

/** GET -> the signed-in account. The contract a native client checks its token against. */
export const GET = withErrorHandling(async () => Response.json({ user: await requireApiUser() }));
