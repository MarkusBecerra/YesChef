"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DIFFICULTY_LABELS } from "@/lib/format";
import { EMPTY_VALUES, payloadFromValues, type RecipeFormValues } from "@/lib/recipe-form-values";
import type { ValidationDetails } from "@/lib/validate";
import { DIFFICULTIES } from "@/server/db/schema";
import type { RecipeDetail } from "@/server/recipes/types";
import { splitLines } from "@/server/recipes/values";

const num = (v: string) => (v.trim() === "" ? null : Number(v));

const DEFAULT_CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Dessert", "Snack", "Side", "Drink", "Sauce", "Baking"];

export function RecipeForm({
  mode,
  recipeId,
  initialValues,
  existingTags,
  existingCategories,
  banner,
  photoSourceUrl,
}: {
  mode: "create" | "edit";
  recipeId?: number;
  initialValues?: RecipeFormValues;
  existingTags: string[];
  existingCategories: string[];
  banner?: React.ReactNode;
  /** Import flow: a remote image the server copies into storage when the recipe is created. */
  photoSourceUrl?: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<RecipeFormValues>(initialValues ?? EMPTY_VALUES);
  const [errors, setErrors] = useState<ValidationDetails | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof RecipeFormValues) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));
  const fieldError = (key: string) => errors?.fieldErrors[key]?.[0];

  const ingredientCount = useMemo(() => splitLines(values.ingredients).length, [values.ingredients]);
  const stepCount = useMemo(() => splitLines(values.steps).length, [values.steps]);
  const autoTotal = useMemo(() => {
    const p = num(values.prepMinutes);
    const c = num(values.cookMinutes);
    if (p == null && c == null) return null;
    return (p ?? 0) + (c ?? 0);
  }, [values.prepMinutes, values.cookMinutes]);

  const categories = useMemo(
    () => Array.from(new Set([...existingCategories, ...DEFAULT_CATEGORIES])),
    [existingCategories],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors(null);
    setFormError(null);
    try {
      const body = JSON.stringify({ ...payloadFromValues(values), ...(mode === "create" && photoSourceUrl ? { photoSourceUrl } : {}) });
      const { recipe } =
        mode === "create"
          ? await api<{ recipe: RecipeDetail }>("/api/v1/recipes", { method: "POST", body })
          : await api<{ recipe: RecipeDetail }>(`/api/v1/recipes/${recipeId}`, { method: "PUT", body });
      router.push(`/recipes/${recipe.id}`);
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 400 && err.details) {
        setErrors(err.details as ValidationDetails);
        setFormError(err.message);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setFormError(err instanceof Error ? err.message : "Could not save the recipe");
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {banner}
      {formError && (
        <p role="alert" className="rounded-card border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      <Field label="Title" htmlFor="title" error={fieldError("title")}>
        <Input id="title" value={values.title} onChange={set("title")} required autoFocus={mode === "create"} placeholder="Weeknight shakshuka" />
      </Field>

      <Field label="Blurb" htmlFor="description" hint="One line for the card." error={fieldError("description")}>
        <Input id="description" value={values.description} onChange={set("description")} placeholder="Eggs poached in spiced tomato" />
      </Field>

      <Field
        label={`Ingredients${ingredientCount ? ` (${ingredientCount})` : ""}`}
        htmlFor="ingredients"
        hint="One per line, with quantities."
        error={fieldError("ingredients")}
      >
        <Textarea
          id="ingredients"
          value={values.ingredients}
          onChange={set("ingredients")}
          rows={8}
          placeholder={"4 eggs\n1 can (400 g) crushed tomatoes\n1 onion, diced"}
        />
      </Field>

      <Field label={`Steps${stepCount ? ` (${stepCount})` : ""}`} htmlFor="steps" hint="One step per line." error={fieldError("steps")}>
        <Textarea
          id="steps"
          value={values.steps}
          onChange={set("steps")}
          rows={8}
          placeholder={"Soften the onion in olive oil.\nAdd tomatoes and spices, simmer 10 min.\nCrack in the eggs, cover, cook until just set."}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Prep (min)" htmlFor="prep" error={fieldError("prepMinutes")}>
          <Input id="prep" type="number" inputMode="numeric" min={0} value={values.prepMinutes} onChange={set("prepMinutes")} />
        </Field>
        <Field label="Cook (min)" htmlFor="cook" error={fieldError("cookMinutes")}>
          <Input id="cook" type="number" inputMode="numeric" min={0} value={values.cookMinutes} onChange={set("cookMinutes")} />
        </Field>
        <Field label="Total (min)" htmlFor="total" error={fieldError("totalMinutes")}>
          <Input
            id="total"
            type="number"
            inputMode="numeric"
            min={0}
            value={values.totalMinutes}
            onChange={set("totalMinutes")}
            placeholder={autoTotal != null ? `${autoTotal}` : "auto"}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Servings" htmlFor="servings" error={fieldError("servings")}>
          <Input id="servings" type="number" inputMode="numeric" min={1} value={values.servings} onChange={set("servings")} />
        </Field>
        <Field label="Yield" htmlFor="yield" error={fieldError("yieldText")}>
          <Input id="yield" value={values.yieldText} onChange={set("yieldText")} placeholder="12 muffins" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Difficulty" htmlFor="difficulty" error={fieldError("difficulty")}>
          <Select id="difficulty" value={values.difficulty} onChange={set("difficulty")}>
            <option value="">—</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="category" error={fieldError("category")}>
          <Input id="category" list="category-options" value={values.category} onChange={set("category")} placeholder="Dinner" />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label="Tags" htmlFor="tags" hint="Comma separated: favorites, keto, high protein" error={fieldError("tags")}>
        <Input id="tags" value={values.tags} onChange={set("tags")} placeholder="weeknight, vegetarian" autoComplete="off" />
        {existingTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {existingTags.slice(0, 20).map((tag) => {
              const active = values.tags
                .split(/[,\n]/)
                .map((t) => t.trim().toLowerCase())
                .includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setValues((prev) => {
                      const current = prev.tags
                        .split(/[,\n]/)
                        .map((t) => t.trim())
                        .filter(Boolean);
                      const next = active ? current.filter((t) => t.toLowerCase() !== tag) : [...current, tag];
                      return { ...prev, tags: next.join(", ") };
                    })
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition",
                    active ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-muted hover:bg-line-soft",
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Source URL" htmlFor="sourceUrl" error={fieldError("sourceUrl")}>
          <Input id="sourceUrl" type="url" inputMode="url" value={values.sourceUrl} onChange={set("sourceUrl")} placeholder="https://…" />
        </Field>
        <Field label="Source name" htmlFor="sourceName" error={fieldError("sourceName")}>
          <Input id="sourceName" value={values.sourceName} onChange={set("sourceName")} placeholder="Smitten Kitchen, Mom, …" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cost" htmlFor="costRating" error={fieldError("costRating")}>
          <div className="flex gap-1" role="radiogroup" aria-label="Cost rating">
            {[1, 2, 3, 4].map((n) => {
              const active = values.costRating === String(n);
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setValues((prev) => ({ ...prev, costRating: active ? "" : String(n) }))}
                  className={cn(
                    "h-10 flex-1 rounded-lg border text-sm font-medium transition",
                    active ? "border-accent bg-accent-soft text-accent" : "border-line bg-paper-raised text-ink-muted hover:bg-line-soft",
                  )}
                >
                  {"$".repeat(n)}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Amount spent ($)" htmlFor="costAmount" error={fieldError("costAmount")}>
          <Input id="costAmount" type="number" inputMode="decimal" min={0} step="0.01" value={values.costAmount} onChange={set("costAmount")} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Tips, substitutions, where it came from." error={fieldError("notes")}>
        <Textarea id="notes" value={values.notes} onChange={set("notes")} rows={4} />
      </Field>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-paper/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()} disabled={busy} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={busy || values.title.trim() === ""} className="flex-[2]">
          {busy ? "Saving…" : mode === "create" ? "Save recipe" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
