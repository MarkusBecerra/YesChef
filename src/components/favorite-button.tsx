"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export function FavoriteButton({ recipeId, isFavorite }: { recipeId: number; isFavorite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isFavorite);

  function toggle() {
    startTransition(async () => {
      setOptimistic(!isFavorite);
      try {
        await api(`/api/v1/recipes/${recipeId}`, { method: "PATCH", body: JSON.stringify({ isFavorite: !isFavorite }) });
        router.refresh();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Could not update");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={optimistic}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition disabled:opacity-60",
        optimistic ? "border-spice/50 bg-spice-soft text-spice" : "border-line bg-paper-raised text-ink-muted hover:bg-line-soft",
      )}
    >
      <span aria-hidden className="text-base leading-none">
        {optimistic ? "♥" : "♡"}
      </span>
      {optimistic ? "Favorite" : "Add to favorites"}
    </button>
  );
}
