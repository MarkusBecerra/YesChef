"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import type { ValidationDetails } from "@/lib/validate";

export function SignupForm({ firstRun, initialCode }: { firstRun: boolean; initialCode: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [errors, setErrors] = useState<ValidationDetails | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldError = (key: string) => errors?.fieldErrors[key]?.[0];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors(null);
    setFormError(null);
    try {
      await api("/api/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, inviteCode }),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.details) {
        setErrors(err.details as ValidationDetails);
        if (!(err.details as ValidationDetails).fieldErrors) setFormError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : "Could not create the account");
      }
    }
  }

  const incomplete = name.trim() === "" || email.trim() === "" || password === "" || inviteCode.trim() === "";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {formError && (
        <p role="alert" className="rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      <Field label="Name" htmlFor="name" error={fieldError("name")}>
        <Input id="name" autoComplete="name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
      </Field>

      <Field label="Email" htmlFor="email" error={fieldError("email")}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 10 characters." error={fieldError("password")}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Field
        label={firstRun ? "Setup code" : "Invite code"}
        htmlFor="inviteCode"
        hint={firstRun ? "OWNER_INVITE_CODE from your environment variables." : "The code you were sent, e.g. YESCHEF-7K2Q-9F4M."}
        error={fieldError("inviteCode")}
      >
        <Input
          id="inviteCode"
          required
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder={firstRun ? "" : "YESCHEF-…"}
        />
      </Field>

      <Button type="submit" size="lg" disabled={busy || incomplete}>
        {busy ? "Creating your account…" : firstRun ? "Claim this kitchen" : "Create account"}
      </Button>
    </form>
  );
}
