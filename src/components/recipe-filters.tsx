"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { DIFFICULTY_LABELS } from "@/lib/format";
import { DIFFICULTIES } from "@/server/db/schema";
import { hasActiveFilters, type FilterState } from "@/server/recipes/query";
import type { RecipeSort, TagSummary } from "@/server/recipes/types";

const SORT_LABELS: Record<RecipeSort, string> = {
  updated: "Recently updated",
  created: "Recently added",
  title: "A to Z",
  lastCooked: "Last cooked",
  cookCount: "Most cooked",
  ingredientCount: "Fewest ingredients",
  totalTime: "Quickest",
};

function toSearch(state: FilterState): string {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.tag) p.set("tag", state.tag);
  if (state.difficulty) p.set("difficulty", state.difficulty);
  if (state.favorite) p.set("favorite", "1");
  if (state.sort !== "updated") p.set("sort", state.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

const chip = (active: boolean) =>
  cn(
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-sm transition",
    active ? "border-accent bg-accent-soft text-accent" : "border-line bg-paper-raised text-ink-muted hover:bg-line-soft",
  );

/** Search, sort, and filter chips. State lives in the URL so the server renders the matching list. */
export function RecipeFilters({ state, tags }: { state: FilterState; tags: TagSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(state.q);
  // The q we last pushed to the URL, and the q the URL last gave us. When the URL changes
  // to something we didn't ask for (back button, "Show all"), reset the box; otherwise
  // leave whatever the user is still typing alone.
  const [requestedQ, setRequestedQ] = useState(state.q);
  const [seenQ, setSeenQ] = useState(state.q);
  if (state.q !== seenQ) {
    setSeenQ(state.q);
    if (state.q !== requestedQ) {
      setQ(state.q);
      setRequestedQ(state.q);
    }
  }
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: Partial<FilterState>) {
    const merged = { ...state, q, ...next };
    setRequestedQ(merged.q);
    const url = pathname + toSearch(merged);
    startTransition(() => router.replace(url, { scroll: false }));
  }

  function onSearch(value: string) {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: value.trim() }), 300);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search recipes</span>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search title, ingredient, or tag"
            className="h-10 w-full rounded-full border border-line bg-paper-raised pl-9 pr-3 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
        <label className="relative shrink-0">
          <span className="sr-only">Sort</span>
          <select
            value={state.sort}
            onChange={(e) => apply({ sort: e.target.value as RecipeSort })}
            className="h-10 appearance-none rounded-full border border-line bg-paper-raised pl-3 pr-8 text-sm text-ink focus:border-accent focus:outline-none"
          >
            {(Object.keys(SORT_LABELS) as RecipeSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <button type="button" className={chip(state.favorite)} onClick={() => apply({ favorite: !state.favorite })} aria-pressed={state.favorite}>
          <span aria-hidden>{state.favorite ? "♥" : "♡"}</span> Favorites
        </button>
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            className={chip(state.difficulty === d)}
            onClick={() => apply({ difficulty: state.difficulty === d ? undefined : d })}
            aria-pressed={state.difficulty === d}
          >
            {DIFFICULTY_LABELS[d]}
          </button>
        ))}
        {tags.length > 0 && <span className="my-auto h-5 w-px shrink-0 bg-line" aria-hidden />}
        {tags.map((t) => (
          <button
            key={t.id}
            type="button"
            className={chip(state.tag === t.name)}
            onClick={() => apply({ tag: state.tag === t.name ? "" : t.name })}
            aria-pressed={state.tag === t.name}
          >
            #{t.name}
            <span className="text-xs text-ink-faint">{t.recipeCount}</span>
          </button>
        ))}
        {hasActiveFilters({ ...state, q }) && (
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm text-ink-muted underline-offset-4 hover:underline"
            onClick={() => {
              setQ("");
              apply({ q: "", tag: "", difficulty: undefined, favorite: false });
            }}
          >
            Clear
          </button>
        )}
      </div>
      {pending && <span className="sr-only" role="status">Updating…</span>}
    </div>
  );
}
