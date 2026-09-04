"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ passphrase }) });
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Passphrase" htmlFor="passphrase" error={error ?? undefined}>
        <Input
          id="passphrase"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={busy || passphrase.length === 0}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
