import type { Metadata } from "next";
import { ImportFlow } from "@/components/import-flow";
import { requireUser } from "@/lib/current-user";
import { listCategories } from "@/server/recipes/service";
import { listTags } from "@/server/tags/service";

export const metadata: Metadata = { title: "Import a recipe" };

export default async function ImportRecipePage() {
  const user = await requireUser();
  const [tags, categories] = await Promise.all([listTags(user.id), listCategories(user.id)]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Import a recipe</h1>
      <ImportFlow existingTags={tags.map((t) => t.name)} existingCategories={categories} />
    </div>
  );
}
