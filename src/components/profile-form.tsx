"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import type { ValidationDetails } from "@/lib/validate";
import type { Account } from "@/server/auth/types";

export function ProfileForm({ account }: { account: Account }) {
  const router = useRouter();
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [errors, setErrors] = useState<ValidationDetails | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== account.name || email.trim().toLowerCase() !== account.email;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors(null);
    setFormError(null);
    setSaved(false);
    try {
      await api("/api/v1/account", { method: "PATCH", body: JSON.stringify({ name, email }) });
      setSaved(true);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details as ValidationDetails);
      else setFormError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {formError && (
        <p role="alert" className="rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}
      <Field label="Name" htmlFor="account-name" error={errors?.fieldErrors.name?.[0]}>
        <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
      </Field>
      <Field label="Email" htmlFor="account-email" error={errors?.fieldErrors.email?.[0]}>
        <Input
          id="account-email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {saved && !dirty && <span className="text-sm text-ink-muted">Saved.</span>}
      </div>
    </form>
  );
}
