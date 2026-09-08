import { NextResponse, type NextRequest } from "next/server";
import { extractToken, readSessionToken, SESSION_COOKIE } from "@/server/auth/session";

/** Paths reachable without a session. */
const PUBLIC_PATHS = new Set(["/login", "/signup", "/api/v1/auth/login", "/api/v1/auth/signup"]);

/**
 * The optimistic check Next recommends for a proxy: is this request carrying a token we
 * signed, and is it still inside its window? Whether the account behind it still exists,
 * and whether the token has been invalidated since, is settled in the data layer by
 * `getCurrentUser` - the proxy cannot reach the database.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = extractToken({
    cookie: request.cookies.get(SESSION_COOKIE)?.value,
    authorization: request.headers.get("authorization"),
  });

  if (await readSessionToken(token)) return NextResponse.next();

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
