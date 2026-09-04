import type { Metadata } from "next";
import { ImportFlow } from "@/components/import-flow";
import { listCategories } from "@/server/recipes/service";
import { listTags } from "@/server/tags/service";

export const metadata: Metadata = { title: "Import a recipe" };

export default async function ImportRecipePage() {
  const [tags, categories] = await Promise.all([listTags(), listCategories()]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Import from a link</h1>
      <ImportFlow existingTags={tags.map((t) => t.name)} existingCategories={categories} />
    </div>
  );
}
