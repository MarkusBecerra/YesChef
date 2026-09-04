"use client";

import { cn } from "@/lib/cn";

function Star({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7z" strokeLinejoin="round" />
    </svg>
  );
}

/** Read-only stars. */
export function RatingStars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex text-spice", className)} aria-label={`${value} out of 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= value} className="size-4" />
      ))}
    </span>
  );
}

/** Tap a star to rate; tap it again to clear. */
export function RatingInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "flex size-11 items-center justify-center rounded-lg border transition",
            value != null && n <= value ? "border-spice/50 bg-spice-soft text-spice" : "border-line bg-paper-raised text-ink-faint hover:text-ink-muted",
          )}
        >
          <Star filled={value != null && n <= value} className="size-6" />
        </button>
      ))}
    </div>
  );
}
