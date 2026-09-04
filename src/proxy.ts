import { NextResponse, type NextRequest } from "next/server";
import { extractToken, SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";

/** Paths reachable without a session. */
const PUBLIC_PATHS = new Set(["/login", "/api/v1/auth/login"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = extractToken({
    cookie: request.cookies.get(SESSION_COOKIE)?.value,
    authorization: request.headers.get("authorization"),
  });

  if (await verifySessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const next = pathname + search;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next internals and public metadata/icon files.
  matcher: ["/((?!_next/|icon\\.svg|favicon\\.ico|apple-icon|icons/|manifest\\.webmanifest|robots\\.txt).*)"],
};
