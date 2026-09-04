import type { Metadata } from "next";
import { getConfiguredPassphrase } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const configured = getConfiguredPassphrase() !== null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Personal recipe log</p>
        <h1 className="font-display text-5xl font-semibold tracking-tight">YesChef</h1>
      </div>
      {configured ? (
        <LoginForm nextPath={nextPath} />
      ) : (
        <div className="rounded-card border border-spice/40 bg-spice-soft p-4 text-sm">
          <p className="font-semibold">Almost set up.</p>
          <p className="mt-1">
            Add <code className="rounded bg-paper px-1">APP_PASSPHRASE</code> to <code className="rounded bg-paper px-1">.env.local</code>{" "}
            (or your host&apos;s environment variables) and restart the server.
          </p>
        </div>
      )}
    </main>
  );
}
