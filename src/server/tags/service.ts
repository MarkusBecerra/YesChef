import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { recipeTags, recipes, tags } from "@/server/db/schema";
import type { TagSummary } from "@/server/recipes/types";

/**
 * One cook's tags with how many of their recipes use each, most-used first. The tag rows
 * themselves are shared - two people who both write "weeknight" land on the same row - so
 * only the join decides what a cook sees. Pure read: orphaned rows are pruned by the write
 * paths that create them (pruneOrphanTags in recipes/service.ts), because a DELETE here
 * would compete for SQLite's single writer on every page load.
 */
export async function listTags(userId: number): Promise<TagSummary[]> {
  const db = getDb();
  const recipeCount = sql<number>`count(${recipeTags.recipeId})`.mapWith(Number);
  const rows = await db
    .select({ id: tags.id, name: tags.name, recipeCount })
    .from(tags)
    .innerJoin(recipeTags, eq(recipeTags.tagId, tags.id))
    .innerJoin(recipes, and(eq(recipes.id, recipeTags.recipeId), eq(recipes.userId, userId)))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(recipeCount), asc(tags.name));
  return rows;
}
