import { clearSessionCookie } from "@/lib/current-user";

export async function POST() {
  await clearSessionCookie();
  return new Response(null, { status: 204 });
}
