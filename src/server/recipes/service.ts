import { and, asc, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { cookLogs, ingredients, recipeTags, recipes, steps, tags } from "@/server/db/schema";
import {
  recipeListQuerySchema,
  type CookLog,
  type ParsedRecipeInput,
  type RecipeDetail,
  type RecipeListQuery,
  type RecipePatch,
  type RecipeSummary,
} from "./types";
import { effectiveTotalMinutes, normalizeTags, nowIso } from "./values";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/* ---------- SQL fragments ---------- */

// Written as literal SQL on purpose: in a single-table select, Drizzle drops table qualifiers from
// column references inside raw fragments, which would turn the correlation into cook_logs.recipe_id = cook_logs.id.
const cookCountSql = sql<number>`(select count(*) from cook_logs cl where cl.recipe_id = recipes.id)`.mapWith(Number);
const lastCookedSql = sql<string | null>`(select max(cl.cooked_on) from cook_logs cl where cl.recipe_id = recipes.id)`;
const effectiveTotalSql = sql`case
  when ${recipes.totalMinutes} is not null then ${recipes.totalMinutes}
  when ${recipes.prepMinutes} is null and ${recipes.cookMinutes} is null then null
  else coalesce(${recipes.prepMinutes}, 0) + coalesce(${recipes.cookMinutes}, 0)
end`;

/** `col LIKE %term%` with LIKE metacharacters escaped. SQLite LIKE is case-insensitive for ASCII. */
function contains(column: SQL | { getSQL(): SQL }, term: string): SQL {
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  return sql`${column} like ${`%${escaped}%`} escape '\\'`;
}

const summaryColumns = {
  id: recipes.id,
  title: recipes.title,
  description: recipes.description,
  photoUrl: recipes.photoUrl,
  difficulty: recipes.difficulty,
  category: recipes.category,
  prepMinutes: recipes.prepMinutes,
  cookMinutes: recipes.cookMinutes,
  totalMinutes: recipes.totalMinutes,
  servings: recipes.servings,
  isFavorite: recipes.isFavorite,
  ingredientCount: recipes.ingredientCount,
  cookCount: cookCountSql,
  lastCookedOn: lastCookedSql,
  createdAt: recipes.createdAt,
  updatedAt: recipes.updatedAt,
};

type SummaryRow = Omit<RecipeSummary, "tags">;

function toSummary(row: SummaryRow, tagNames: string[]): RecipeSummary {
  return {
    ...row,
    totalMinutes: effectiveTotalMinutes(row),
    lastCookedOn: row.lastCookedOn ?? null,
    tags: tagNames,
  };
}

async function tagsByRecipe(db: Executor, recipeIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (recipeIds.length === 0) return map;
  const rows = await db
    .select({ recipeId: recipeTags.recipeId, name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(tags.id, recipeTags.tagId))
    .where(inArray(recipeTags.recipeId, recipeIds))
    .orderBy(asc(tags.name));
  for (const r of rows) {
    const list = map.get(r.recipeId) ?? [];
    list.push(r.name);
    map.set(r.recipeId, list);
  }
  return map;
}

/* ---------- reads ---------- */

export async function listRecipes(query: RecipeListQuery = {}): Promise<RecipeSummary[]> {
  const db = getDb();
  const { q, tag, category, difficulty, favorite, sort } = recipeListQuerySchema.parse(query);

  const where: SQL[] = [];
  if (q) {
    where.push(
      or(
        contains(recipes.title, q),
        exists(
          db
            .select({ one: sql`1` })
            .from(ingredients)
            .where(and(eq(ingredients.recipeId, recipes.id), contains(ingredients.text, q))),
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(recipeTags)
            .innerJoin(tags, eq(tags.id, recipeTags.tagId))
            .where(and(eq(recipeTags.recipeId, recipes.id), contains(tags.name, q))),
        ),
      )!,
    );
  }
  if (tag) {
    const name = normalizeTags([tag])[0];
    if (name) {
      where.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(recipeTags)
            .innerJoin(tags, eq(tags.id, recipeTags.tagId))
            .where(and(eq(recipeTags.recipeId, recipes.id), eq(tags.name, name))),
        ),
      );
    }
  }
  if (category) where.push(sql`${recipes.category} = ${category} collate nocase`);
  if (difficulty) where.push(eq(recipes.difficulty, difficulty));
  if (favorite) where.push(eq(recipes.isFavorite, true));

  const titleAsc = sql`${recipes.title} collate nocase asc`;
  const orderBy: SQL[] = {
    updated: [desc(recipes.updatedAt), titleAsc],
    created: [desc(recipes.createdAt), titleAsc],
    title: [titleAsc],
    lastCooked: [sql`${lastCookedSql} desc nulls last`, desc(recipes.updatedAt)],
    cookCount: [desc(cookCountSql), sql`${lastCookedSql} desc nulls last`, titleAsc],
    ingredientCount: [asc(recipes.ingredientCount), titleAsc],
    totalTime: [sql`${effectiveTotalSql} asc nulls last`, titleAsc],
  }[sort];

  const rows = await db
    .select(summaryColumns)
    .from(recipes)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...orderBy);

  const tagMap = await tagsByRecipe(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toSummary(r, tagMap.get(r.id) ?? []));
}

export async function getRecipe(id: number): Promise<RecipeDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      ...summaryColumns,
      notes: recipes.notes,
      yieldText: recipes.yieldText,
      sourceUrl: recipes.sourceUrl,
      sourceName: recipes.sourceName,
      costRating: recipes.costRating,
      costAmount: recipes.costAmount,
    })
    .from(recipes)
    .where(eq(recipes.id, id))
    .limit(1);
  if (!row) return null;

  const [ingredientRows, stepRows, tagMap, logRows] = await Promise.all([
    db.select({ text: ingredients.text }).from(ingredients).where(eq(ingredients.recipeId, id)).orderBy(asc(ingredients.position)),
    db.select({ text: steps.text }).from(steps).where(eq(steps.recipeId, id)).orderBy(asc(steps.position)),
    tagsByRecipe(db, [id]),
    db.select().from(cookLogs).where(eq(cookLogs.recipeId, id)).orderBy(desc(cookLogs.cookedOn), desc(cookLogs.id)),
  ]);

  const { notes, yieldText, sourceUrl, sourceName, costRating, costAmount, ...summaryRow } = row;
  return {
    ...toSummary(summaryRow, tagMap.get(id) ?? []),
    notes,
    yieldText,
    sourceUrl,
    sourceName,
    costRating,
    costAmount,
    explicitTotalMinutes: row.totalMinutes,
    ingredients: ingredientRows.map((r) => r.text),
    steps: stepRows.map((r) => r.text),
    cookLogs: logRows satisfies CookLog[],
  };
}

/* ---------- writes ---------- */

function recipeColumns(input: ParsedRecipeInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    notes: input.notes ?? null,
    prepMinutes: input.prepMinutes ?? null,
    cookMinutes: input.cookMinutes ?? null,
    totalMinutes: input.totalMinutes ?? null,
    servings: input.servings ?? null,
    yieldText: input.yieldText ?? null,
    difficulty: input.difficulty ?? null,
    category: input.category ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceName: input.sourceName ?? null,
    costRating: input.costRating ?? null,
    costAmount: input.costAmount ?? null,
    ingredientCount: input.ingredients.length,
  };
}

async function writeChildren(tx: Executor, recipeId: number, input: ParsedRecipeInput): Promise<void> {
  if (input.ingredients.length) {
    await tx.insert(ingredients).values(input.ingredients.map((text, position) => ({ recipeId, position, text })));
  }
  if (input.steps.length) {
    await tx.insert(steps).values(input.steps.map((text, position) => ({ recipeId, position, text })));
  }
  const names = normalizeTags(input.tags);
  if (names.length) {
    await tx
      .insert(tags)
      .values(names.map((name) => ({ name })))
      .onConflictDoNothing();
    const tagRows = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.name, names));
    await tx.insert(recipeTags).values(tagRows.map((t) => ({ recipeId, tagId: t.id })));
  }
}

async function deleteChildren(tx: Executor, recipeId: number): Promise<void> {
  await tx.delete(ingredients).where(eq(ingredients.recipeId, recipeId));
  await tx.delete(steps).where(eq(steps.recipeId, recipeId));
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));
}

export async function createRecipe(input: ParsedRecipeInput): Promise<RecipeDetail> {
  const db = getDb();
  const now = nowIso();
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recipes)
      .values({ ...recipeColumns(input), isFavorite: input.isFavorite ?? false, createdAt: now, updatedAt: now })
      .returning({ id: recipes.id });
    await writeChildren(tx, row.id, input);
    return row.id;
  });
  return (await getRecipe(id))!;
}

export async function updateRecipe(id: number, input: ParsedRecipeInput): Promise<RecipeDetail | null> {
  const db = getDb();
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(recipes)
      .set({
        ...recipeColumns(input),
        ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
        updatedAt: nowIso(),
      })
      .where(eq(recipes.id, id))
      .returning({ id: recipes.id });
    if (rows.length === 0) return false;
    await deleteChildren(tx, id);
    await writeChildren(tx, id, input);
    return true;
  });
  return updated ? getRecipe(id) : null;
}

export async function patchRecipe(id: number, patch: RecipePatch): Promise<RecipeDetail | null> {
  const db = getDb();
  if (patch.isFavorite !== undefined) {
    // Favouriting is not an edit: leave updatedAt alone so "recently updated" ordering holds.
    const rows = await db.update(recipes).set({ isFavorite: patch.isFavorite }).where(eq(recipes.id, id)).returning({ id: recipes.id });
    if (rows.length === 0) return null;
  }
  return getRecipe(id);
}

export async function setRecipePhoto(id: number, photoUrl: string | null): Promise<RecipeDetail | null> {
  const db = getDb();
  const rows = await db.update(recipes).set({ photoUrl, updatedAt: nowIso() }).where(eq(recipes.id, id)).returning({ id: recipes.id });
  return rows.length ? getRecipe(id) : null;
}

/** Deletes the recipe and everything hanging off it. Returns the photo URL so storage can clean up. */
export async function deleteRecipe(id: number): Promise<{ photoUrl: string | null } | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ photoUrl: recipes.photoUrl }).from(recipes).where(eq(recipes.id, id)).limit(1);
    if (!existing) return null;
    await deleteChildren(tx, id);
    await tx.delete(cookLogs).where(eq(cookLogs.recipeId, id));
    await tx.delete(recipes).where(eq(recipes.id, id));
    return { photoUrl: existing.photoUrl };
  });
}
