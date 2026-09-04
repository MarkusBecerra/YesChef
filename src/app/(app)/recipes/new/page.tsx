import type { Metadata } from "next";
import Link from "next/link";
import { RecipeForm } from "@/components/recipe-form";
import { listCategories } from "@/server/recipes/service";
import { listTags } from "@/server/tags/service";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const [tags, categories] = await Promise.all([listTags(), listCategories()]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">New recipe</h1>
      <Link
        href="/recipes/import"
        className="flex items-center justify-between gap-3 rounded-card border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-accent transition hover:brightness-95"
      >
        <span>
          <span className="font-semibold">Have a link?</span> Paste it and let the app fill this in.
        </span>
        <span aria-hidden>→</span>
      </Link>
      <RecipeForm mode="create" existingTags={tags.map((t) => t.name)} existingCategories={categories} />
    </div>
  );
}
