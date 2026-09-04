import type { Difficulty } from "@/server/db/schema";

export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export function formatCost(rating: number | null | undefined): string | null {
  if (!rating) return null;
  return "$".repeat(Math.min(4, Math.max(1, rating)));
}

export function formatMoney(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}

/** "2026-03-01" -> "Mar 1, 2026" (parsed as a local calendar date, not UTC). */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(y, m - 1, d));
}

/** Relative wording for a calendar date: "today", "yesterday", "5 days ago", "3 weeks ago", ... */
export function formatRelativeDate(isoDate: string, now = new Date()): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
