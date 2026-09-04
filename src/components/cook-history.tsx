"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RatingStars } from "@/components/rating";
import { api } from "@/lib/api";
import { formatDate, formatRelativeDate } from "@/lib/format";
import type { CookLog } from "@/server/recipes/types";

export function CookHistory({ recipeId, logs }: { recipeId: number; logs: CookLog[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function remove(log: CookLog) {
    if (!window.confirm(`Remove the cook from ${formatDate(log.cookedOn)}?`)) return;
    setBusyId(log.id);
    try {
      await api(`/api/v1/cooks/${log.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusyId(null);
    }
  }

  const count = logs.length;
  const last = logs[0];

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-paper-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Cook log</h2>
          <p className="text-sm text-ink-muted">
            {count === 0
              ? "Not cooked yet."
              : `Cooked ${count} time${count === 1 ? "" : "s"} · last ${formatRelativeDate(last.cookedOn)}`}
          </p>
        </div>
        <Link
          href={`/recipes/${recipeId}/log`}
          className="inline-flex h-10 shrink-0 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink transition hover:brightness-110"
        >
          Log a cook
        </Link>
      </div>

      {count > 0 && (
        <ol className="divide-y divide-line-soft">
          {logs.map((log) => (
            <li key={log.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <time dateTime={log.cookedOn} className="text-sm font-medium">
                    {formatDate(log.cookedOn)}
                  </time>
                  {log.rating != null && <RatingStars value={log.rating} />}
                </div>
                {log.notes && <p className="break-anywhere mt-1 whitespace-pre-line text-sm text-ink-muted">{log.notes}</p>}
              </div>
              <button
                type="button"
                onClick={() => remove(log)}
                disabled={busyId === log.id}
                className="rounded-full p-1.5 text-ink-faint transition hover:bg-line-soft hover:text-danger disabled:opacity-50"
                aria-label="Remove this cook"
                title="Remove"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M6 7h12M9 7V5h6v2m-7 0 1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
