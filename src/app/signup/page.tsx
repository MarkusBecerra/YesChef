import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { needsOwner } from "@/server/auth/service";
import { getAuthSecret } from "@/server/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function SignupPage(props: PageProps<"/signup">) {
  const configured = getAuthSecret() !== null;
  if (configured && (await getCurrentUser())) redirect("/");

  const { code } = await props.searchParams;
  const initialCode = typeof code === "string" ? code.slice(0, 60) : "";
  const firstRun = configured ? await needsOwner() : false;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">
          {firstRun ? "First run" : "Invite only"}
        </p>
        <h1 className="font-display text-5xl font-semibold tracking-tight">YesChef</h1>
      </div>

      {!configured ? (
        <div className="rounded-card border border-spice/40 bg-spice-soft p-4 text-sm">
          <p className="font-semibold">This server isn&apos;t set up yet.</p>
          <p className="mt-1">
            It needs <code className="rounded bg-paper px-1">AUTH_SECRET</code> and{" "}
            <code className="rounded bg-paper px-1">OWNER_INVITE_CODE</code> in its environment.
          </p>
        </div>
      ) : (
        <>
          <SignupForm firstRun={firstRun} initialCode={initialCode} />
          <p className="mt-6 text-center text-sm text-ink-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
              Sign in
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
