import Link from "next/link";
import { Pill } from "@/components/ui/pill";
import { DIFFICULTY_LABELS, formatMinutes, formatRelativeDate } from "@/lib/format";
import { RecipePhoto } from "./recipe-photo";
import type { RecipeSummary } from "@/server/recipes/types";

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const total = formatMinutes(recipe.totalMinutes);
  const cooked =
    recipe.cookCount === 0
      ? "Not cooked yet"
      : `Cooked ${recipe.cookCount}× · ${formatRelativeDate(recipe.lastCookedOn!)}`;

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised shadow-card transition hover:border-ink-faint"
    >
      <RecipePhoto src={recipe.photoUrl} alt="" sizes="(min-width: 640px) 33vw, 50vw" className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h2 className="line-clamp-2 font-display text-lg font-semibold leading-tight">
          {recipe.isFavorite && (
            <span className="mr-1 text-spice" aria-label="Favourite">
              ♥
            </span>
          )}
          {recipe.title}
        </h2>
        <p className="text-xs text-ink-muted">{cooked}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {recipe.difficulty && <Pill tone="accent">{DIFFICULTY_LABELS[recipe.difficulty]}</Pill>}
          {total && <Pill>{total}</Pill>}
          <Pill>{recipe.ingredientCount} ingr.</Pill>
        </div>
      </div>
    </Link>
  );
}
