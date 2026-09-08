import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { cookLogs, recipes } from "@/server/db/schema";
import { cookLogInputSchema, type CookLog, type CookLogInput } from "@/server/recipes/types";
import { nowIso, todayIsoDate } from "@/server/recipes/values";

/** Does this recipe exist and belong to this cook? Every write below goes through it. */
async function ownsRecipe(userId: number, recipeId: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** The cook log's own recipe, when it belongs to this cook. */
async function ownedLogRecipeId(userId: number, logId: number): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ recipeId: cookLogs.recipeId })
    .from(cookLogs)
    .innerJoin(recipes, eq(recipes.id, cookLogs.recipeId))
    .where(and(eq(cookLogs.id, logId), eq(recipes.userId, userId)))
    .limit(1);
  return row?.recipeId ?? null;
}

/** Log a cook against a recipe. Returns null when the recipe isn't this cook's (or doesn't exist). */
export async function addCookLog(userId: number, recipeId: number, input: CookLogInput): Promise<CookLog | null> {
  const db = getDb();
  const parsed = cookLogInputSchema.parse(input);
  if (!(await ownsRecipe(userId, recipeId))) return null;
  const [row] = await db
    .insert(cookLogs)
    .values({
      recipeId,
      cookedOn: parsed.cookedOn ?? todayIsoDate(),
      rating: parsed.rating ?? null,
      notes: parsed.notes ?? null,
      createdAt: nowIso(),
    })
    .returning();
  return row;
}

export async function updateCookLog(userId: number, id: number, input: CookLogInput): Promise<CookLog | null> {
  const db = getDb();
  const parsed = cookLogInputSchema.parse(input);
  if ((await ownedLogRecipeId(userId, id)) === null) return null;
  const [row] = await db
    .update(cookLogs)
    .set({
      ...(parsed.cookedOn !== undefined ? { cookedOn: parsed.cookedOn } : {}),
      ...(parsed.rating !== undefined ? { rating: parsed.rating } : {}),
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
    })
    .where(eq(cookLogs.id, id))
    .returning();
  return row ?? null;
}

export async function deleteCookLog(userId: number, id: number): Promise<boolean> {
  const db = getDb();
  if ((await ownedLogRecipeId(userId, id)) === null) return false;
  const rows = await db.delete(cookLogs).where(eq(cookLogs.id, id)).returning({ id: cookLogs.id });
  return rows.length > 0;
}
