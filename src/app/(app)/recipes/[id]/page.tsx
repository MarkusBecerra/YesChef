import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CookHistory } from "@/components/cook-history";
import { DeleteRecipeButton } from "@/components/delete-recipe-button";
import { FavoriteButton } from "@/components/favorite-button";
import { IngredientList } from "@/components/ingredient-list";
import { PhotoUploader } from "@/components/photo-uploader";
import { RecipePhoto } from "@/components/recipe-photo";
import { Pill } from "@/components/ui/pill";
import { getCurrentUser, requireUser } from "@/lib/current-user";
import { DIFFICULTY_LABELS, formatCost, formatMinutes, formatMoney, plural } from "@/lib/format";
import { getRecipe } from "@/server/recipes/service";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(props: PageProps<"/recipes/[id]">): Promise<Metadata> {
  const id = parseId((await props.params).id);
  const user = await getCurrentUser();
  const recipe = id && user ? await getRecipe(user.id, id) : null;
  return { title: recipe?.title ?? "Recipe" };
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl font-semibold">
        {title}
        {count != null && <span className="ml-2.5 rounded-full bg-line-soft px-2 py-0.5 align-middle text-xs font-medium text-ink-muted">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export default async function RecipePage(props: PageProps<"/recipes/[id]">) {
  const user = await requireUser();
  const id = parseId((await props.params).id);
  if (!id) notFound();
  const recipe = await getRecipe(user.id, id);
  if (!recipe) notFound();

  const prep = formatMinutes(recipe.prepMinutes);
  const cook = formatMinutes(recipe.cookMinutes);
  const total = formatMinutes(recipe.totalMinutes);
  const cost = formatCost(recipe.costRating);
  const spent = formatMoney(recipe.costAmount);
  let sourceHost: string | null = null;
  if (recipe.sourceUrl) {
    try {
      sourceHost = new URL(recipe.sourceUrl).hostname.replace(/^www\./, "");
    } catch {}
  }

  return (
    <article className="flex flex-col gap-6">
      <Link href="/" className="-mt-1 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <span aria-hidden>←</span> Recipes
      </Link>

      <div className="relative -mx-4 sm:mx-0">
        <RecipePhoto
          src={recipe.photoUrl}
          alt={recipe.title}
          sizes="(min-width: 768px) 768px, 100vw"
          priority
          className="aspect-[4/3] max-h-[440px] sm:rounded-card"
        />
        <PhotoUploader recipeId={recipe.id} hasPhoto={recipe.photoUrl !== null} className="absolute bottom-3 left-4 sm:left-3" />
      </div>

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">
          {recipe.isFavorite && (
            <span className="mr-2 text-spice" aria-label="Favourite">
              ♥
            </span>
          )}
          {recipe.title}
        </h1>
        {recipe.description && <p className="text-ink-muted">{recipe.description}</p>}

        <dl className="grid grid-cols-3 gap-2 rounded-card border border-line bg-paper-raised p-3 text-center text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Prep</dt>
            <dd className="font-medium">{prep ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Cook</dt>
            <dd className="font-medium">{cook ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Total</dt>
            <dd className="font-medium">{total ?? "—"}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-1.5">
          {recipe.difficulty && <Pill tone="accent">{DIFFICULTY_LABELS[recipe.difficulty]}</Pill>}
          {recipe.servings != null && <Pill>{plural(recipe.servings, "serving")}</Pill>}
          {recipe.yieldText && <Pill>{recipe.yieldText}</Pill>}
          {recipe.category && <Pill>{recipe.category}</Pill>}
          {cost && <Pill tone="spice">{spent ? `${cost} · ${spent}` : cost}</Pill>}
          {!cost && spent && <Pill tone="spice">{spent}</Pill>}
          {recipe.tags.map((tag) => (
            <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`} className="hover:opacity-80">
              <Pill>#{tag}</Pill>
            </Link>
          ))}
        </div>

        {(recipe.sourceUrl || recipe.sourceName) && (
          <p className="text-sm text-ink-muted">
            Source:{" "}
            {recipe.sourceUrl ? (
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-accent underline-offset-4 hover:underline">
                {recipe.sourceName || sourceHost}
              </a>
            ) : (
              recipe.sourceName
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <FavoriteButton recipeId={recipe.id} isFavorite={recipe.isFavorite} />
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="inline-flex h-8 items-center rounded-full border border-line bg-paper-raised px-3 text-sm font-medium hover:bg-line-soft"
          >
            Edit
          </Link>
          <DeleteRecipeButton id={recipe.id} title={recipe.title} />
        </div>
      </header>

      <CookHistory recipeId={recipe.id} logs={recipe.cookLogs} />

      <Section title="Ingredients" count={recipe.ingredients.length}>
        {recipe.ingredients.length ? <IngredientList items={recipe.ingredients} /> : <p className="text-sm text-ink-muted">None listed.</p>}
      </Section>

      <Section title="Steps" count={recipe.steps.length}>
        {recipe.steps.length ? (
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                <p className="break-anywhere leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">No steps written down.</p>
        )}
      </Section>

      {recipe.notes && (
        <Section title="Notes">
          <p className="break-anywhere whitespace-pre-line leading-relaxed text-ink-muted">{recipe.notes}</p>
        </Section>
      )}
    </article>
  );
}
