"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { api, ApiError } from "@/lib/api";
import type { Invite, Seats } from "@/server/auth/types";

const STATUS_LABEL: Record<Invite["status"], string> = { open: "Unused", used: "Joined", revoked: "Cancelled" };

/**
 * The owner's invite desk: mint a code, read it back later to re-send it, cancel one that
 * went to the wrong person. Codes only exist here - they are never shown to anyone else.
 */
export function InviteManager({ initialInvites, seats }: { initialInvites: Invite[]; seats: Seats }) {
  const [invites, setInvites] = useState(initialInvites);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const open = invites.filter((i) => i.status === "open").length;
  /** Unused codes beyond the size the owner planned for. Worth a note, never a refusal. */
  const overPlan = open > seats.remaining;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { invite } = await api<{ invite: Invite }>("/api/v1/invites", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      setInvites((prev) => [invite, ...prev]);
      setLabel("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create an invite");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invite: Invite) {
    if (!window.confirm(`Cancel ${invite.code}? Anyone holding it won't be able to sign up.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/invites/${invite.id}`, { method: "DELETE" });
      setInvites((prev) => prev.map((i) => (i.id === invite.id ? { ...i, status: "revoked" as const } : i)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel that invite");
    } finally {
      setBusy(false);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setError("Your browser wouldn't let the app copy - select the code and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        {seats.used} {seats.used === 1 ? "account" : "accounts"}, of the {seats.max} you planned for. Each code works once.
      </p>

      {error && (
        <p role="alert" className="rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Who is it for? (optional)"
          aria-label="Invite label"
          maxLength={80}
        />
        <Button type="button" onClick={create} disabled={busy} className="shrink-0">
          New code
        </Button>
      </div>
      {overPlan && (
        <p className="text-sm text-ink-muted">
          {open} unused {open === 1 ? "code" : "codes"} for the {seats.remaining} {seats.remaining === 1 ? "place" : "places"} left
          of your {seats.max}. They all still work - raise MAX_ACCOUNTS if you want the count to match.
        </p>
      )}

      {invites.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
          No invites yet. Mint one and send it to whoever you&apos;re cooking with.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-col gap-2 rounded-card border border-line bg-paper-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="break-anywhere font-mono text-sm font-semibold tracking-wide">{invite.code}</code>
                <Pill tone={invite.status === "open" ? "accent" : invite.status === "used" ? "neutral" : "spice"}>
                  {STATUS_LABEL[invite.status]}
                </Pill>
              </div>
              <p className="text-sm text-ink-muted">
                {invite.label ? `For ${invite.label}. ` : ""}
                {invite.status === "used" ? `Used by ${invite.usedByName ?? "someone"}.` : null}
              </p>
              {invite.status === "open" && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => copy(`code-${invite.id}`, invite.code)}>
                    {copied === `code-${invite.id}` ? "Copied" : "Copy code"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => copy(`link-${invite.id}`, `${window.location.origin}/signup?code=${encodeURIComponent(invite.code)}`)}
                  >
                    {copied === `link-${invite.id}` ? "Copied" : "Copy sign-up link"}
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={() => revoke(invite)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
