import Link from "next/link";
import { Fab } from "@/components/fab";
import { RecipeCard } from "@/components/recipe-card";
import { plural } from "@/lib/format";
import { listRecipes } from "@/server/recipes/service";

export default async function HomePage() {
  const recipes = await listRecipes();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Recipes</h1>
        <p className="text-sm text-ink-muted">{plural(recipes.length, "recipe")}</p>
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-16 text-center">
          <p className="font-display text-xl font-semibold">Nothing cooked yet.</p>
          <p className="max-w-xs text-sm text-ink-muted">Add your first recipe and start logging what you make.</p>
          <Link href="/recipes/new" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
            Add a recipe
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {recipes.map((r) => (
            <li key={r.id} className="flex">
              <RecipeCard recipe={r} />
            </li>
          ))}
        </ul>
      )}

      <Fab href="/recipes/new" label="Add" />
    </div>
  );
}
