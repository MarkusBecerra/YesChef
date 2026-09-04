"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Tap to tick off ingredients while cooking. State is local to the page visit on purpose. */
export function IngredientList({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set());

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <ul className="divide-y divide-line-soft rounded-card border border-line bg-paper-raised">
      {items.map((item, i) => {
        const done = checked.has(i);
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={done}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-line-soft"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                  done ? "border-accent bg-accent text-accent-ink" : "border-line",
                )}
                aria-hidden
              >
                {done && "✓"}
              </span>
              <span className={cn("break-anywhere leading-snug", done && "text-ink-faint line-through")}>{item}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
