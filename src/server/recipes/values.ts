/** Pure helpers shared by validation, services, and tests. No I/O. */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's calendar date in the server's local time zone, YYYY-MM-DD. */
export function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tags are case-insensitive and whitespace-insensitive: "High Protein " -> "high protein". */
export function normalizeTag(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeTags(names: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of names) {
    const n = normalizeTag(raw);
    if (n) seen.add(n);
  }
  return [...seen];
}

/** Split a textarea into one entry per non-empty line. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** Effective total time: explicit total wins, else prep + cook when either is set. */
export function effectiveTotalMinutes(input: {
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
}): number | null {
  if (input.totalMinutes != null) return input.totalMinutes;
  if (input.prepMinutes == null && input.cookMinutes == null) return null;
  return (input.prepMinutes ?? 0) + (input.cookMinutes ?? 0);
}

/**
 * A recipe needs more than a title: at least one ingredient or one step.
 * Shared by `recipeInputSchema` and the form so the save button and the API agree.
 */
export function hasRecipeBody(input: { ingredients: readonly string[]; steps: readonly string[] }): boolean {
  return input.ingredients.length > 0 || input.steps.length > 0;
}
