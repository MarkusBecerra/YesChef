import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CookLogForm } from "@/components/cook-log-form";
import { requireUser } from "@/lib/current-user";
import { getRecipe } from "@/server/recipes/service";

export const metadata: Metadata = { title: "Log a cook" };

export default async function LogCookPage(props: PageProps<"/recipes/[id]/log">) {
  const user = await requireUser();
  const id = Number((await props.params).id);
  const recipe = Number.isInteger(id) && id > 0 ? await getRecipe(user.id, id) : null;
  if (!recipe) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/recipes/${recipe.id}`} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <span aria-hidden>←</span> {recipe.title}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Log a cook</h1>
        <p className="text-sm text-ink-muted">
          {recipe.cookCount === 0 ? "First time making this." : `You've made this ${recipe.cookCount} time${recipe.cookCount === 1 ? "" : "s"}.`}
        </p>
      </div>
      <CookLogForm recipeId={recipe.id} />
    </div>
  );
}
