import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { HttpError } from "@/lib/http";
import { getAccountForSession } from "@/server/auth/service";
import { extractToken, readSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/server/auth/session";
import type { Account } from "@/server/auth/types";

/**
 * Server-only. The bridge between Next's request APIs and the session logic in
 * `src/server/auth`, which stays free of Next imports so it can move to another host.
 *
 * The proxy has already checked the token's signature by the time these run; this is the
 * authoritative check, because only here can the token's version be compared against the
 * user row (see server/auth/session.ts).
 */

/** The signed-in account, or null. Reads the cookie, or a bearer token from a native client. */
export async function getCurrentUser(): Promise<Account | null> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const token = extractToken({
    cookie: cookieStore.get(SESSION_COOKIE)?.value,
    authorization: headerList.get("authorization"),
  });
  const claims = await readSessionToken(token);
  if (!claims) return null;
  return getAccountForSession(claims);
}

/** For pages: send anyone without a session to the login screen. */
export async function requireUser(): Promise<Account> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages the owner alone can see. */
export async function requireOwner(): Promise<Account> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}

/** For route handlers: a 401 in the shape the API uses everywhere else. */
export async function requireApiUser(): Promise<Account> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Unauthorized");
  return user;
}

export async function requireApiOwner(): Promise<Account> {
  const user = await requireApiUser();
  if (user.role !== "owner") throw new HttpError(403, "Only the owner can do that");
  return user;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
