"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const ORDER = ["system", "light", "dark"] as const;
type Mode = (typeof ORDER)[number];

const LABELS: Record<Mode, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };

function Icon({ mode }: { mode: Mode }) {
  if (mode === "light") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const noop = () => () => {};
/** false during SSR/hydration, true once running in the browser. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/** Cycles system -> light -> dark. Renders a neutral icon until mounted to avoid hydration mismatch. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const mode: Mode = mounted && ORDER.includes(theme as Mode) ? (theme as Mode) : "system";
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex size-10 items-center justify-center rounded-full text-ink-muted transition hover:bg-line-soft hover:text-ink"
      aria-label={`${LABELS[mode]}. Switch to ${LABELS[next].toLowerCase()}`}
      title={LABELS[mode]}
    >
      <Icon mode={mode} />
    </button>
  );
}
