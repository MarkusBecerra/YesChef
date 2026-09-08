import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { needsOwner } from "@/server/auth/service";
import { getAuthSecret } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/**
 * Only a path on this site. A leading `//` or `/\` is a scheme-relative URL - the browser
 * resolves `/\evil.com` to `https://evil.com/` - so a second slash of either kind is out.
 */
function safeNextPath(next: unknown): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : "/";
}

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const nextPath = safeNextPath(next);
  const configured = getAuthSecret() !== null;
  if (configured && (await getCurrentUser())) redirect(nextPath);
  const firstRun = configured && (await needsOwner());

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Your recipe log</p>
        <h1 className="font-display text-5xl font-semibold tracking-tight">YesChef</h1>
      </div>

      {!configured ? (
        <div className="rounded-card border border-spice/40 bg-spice-soft p-4 text-sm">
          <p className="font-semibold">Almost set up.</p>
          <p className="mt-1">
            Add <code className="rounded bg-paper px-1">AUTH_SECRET</code> and{" "}
            <code className="rounded bg-paper px-1">OWNER_INVITE_CODE</code> to{" "}
            <code className="rounded bg-paper px-1">.env.local</code> (or your host&apos;s environment variables) and restart the
            server.
          </p>
        </div>
      ) : firstRun ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-accent/40 bg-accent-soft p-4 text-sm">
            <p className="font-semibold">Nobody has claimed this kitchen yet.</p>
            <p className="mt-1">Create the owner account with the setup code from your environment variables.</p>
          </div>
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-5 text-base font-medium text-accent-ink transition hover:brightness-110"
          >
            Create the owner account
          </Link>
        </div>
      ) : (
        <>
          <LoginForm nextPath={nextPath} />
          <p className="mt-6 text-center text-sm text-ink-muted">
            Got an invite code?{" "}
            <Link href="/signup" className="font-medium text-accent underline-offset-4 hover:underline">
              Create an account
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
