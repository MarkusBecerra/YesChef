"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import type { ValidationDetails } from "@/lib/validate";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<ValidationDetails | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors(null);
    setFormError(null);
    setDone(false);
    try {
      await api("/api/v1/account/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword("");
      setNewPassword("");
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details as ValidationDetails);
      else setFormError(err instanceof Error ? err.message : "Could not change the password");
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
      <Field label="Current password" htmlFor="current-password" error={errors?.fieldErrors.currentPassword?.[0]}>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </Field>
      <Field
        label="New password"
        htmlFor="new-password"
        hint="At least 10 characters. Signs out your other devices."
        error={errors?.fieldErrors.newPassword?.[0]}
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={busy || currentPassword === "" || newPassword === ""}>
          {busy ? "Changing…" : "Change password"}
        </Button>
        {done && <span className="text-sm text-ink-muted">Password changed.</span>}
      </div>
    </form>
  );
}
