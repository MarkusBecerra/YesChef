import type { Metadata } from "next";
import { RecipeForm } from "@/components/recipe-form";
import { listCategories } from "@/server/recipes/service";
import { listTags } from "@/server/tags/service";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const [tags, categories] = await Promise.all([listTags(), listCategories()]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">New recipe</h1>
      <RecipeForm mode="create" existingTags={tags.map((t) => t.name)} existingCategories={categories} />
    </div>
  );
}
