import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { cookLogs, recipes } from "@/server/db/schema";
import { cookLogInputSchema, type CookLog, type CookLogInput } from "@/server/recipes/types";
import { nowIso, todayIsoDate } from "@/server/recipes/values";

/** Log a cook against a recipe. Returns null when the recipe doesn't exist. */
export async function addCookLog(recipeId: number, input: CookLogInput): Promise<CookLog | null> {
  const db = getDb();
  const parsed = cookLogInputSchema.parse(input);
  const [recipe] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recipeId)).limit(1);
  if (!recipe) return null;
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

export async function updateCookLog(id: number, input: CookLogInput): Promise<CookLog | null> {
  const db = getDb();
  const parsed = cookLogInputSchema.parse(input);
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

export async function deleteCookLog(id: number): Promise<boolean> {
  const db = getDb();
  const rows = await db.delete(cookLogs).where(eq(cookLogs.id, id)).returning({ id: cookLogs.id });
  return rows.length > 0;
}
