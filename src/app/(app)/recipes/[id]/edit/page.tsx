import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/recipe-form";
import { valuesFromRecipe } from "@/lib/recipe-form-values";
import { getRecipe, listCategories } from "@/server/recipes/service";
import { listTags } from "@/server/tags/service";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(props: PageProps<"/recipes/[id]/edit">): Promise<Metadata> {
  const id = parseId((await props.params).id);
  const recipe = id ? await getRecipe(id) : null;
  return { title: recipe ? `Edit ${recipe.title}` : "Edit recipe" };
}

export default async function EditRecipePage(props: PageProps<"/recipes/[id]/edit">) {
  const id = parseId((await props.params).id);
  if (!id) notFound();
  const [recipe, tags, categories] = await Promise.all([getRecipe(id), listTags(), listCategories()]);
  if (!recipe) notFound();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Edit recipe</h1>
      <RecipeForm
        mode="edit"
        recipeId={recipe.id}
        initialValues={valuesFromRecipe(recipe)}
        existingTags={tags.map((t) => t.name)}
        existingCategories={categories}
      />
    </div>
  );
}
