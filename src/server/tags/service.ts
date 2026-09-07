import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { recipeTags, recipes, tags } from "@/server/db/schema";
import type { TagSummary } from "@/server/recipes/types";

/**
 * One cook's tags with how many of their recipes use each, most-used first. The tag rows
 * themselves are shared - two people who both write "weeknight" land on the same row - so
 * only the join decides what a cook sees. Rows nobody uses any more are pruned as we go.
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

  // Written out rather than built with the query builder: a correlated subquery is the one
  // shape Drizzle mangles by dropping table qualifiers (see cookCountSql in recipes/service).
  await db.run(sql`delete from tags where not exists (select 1 from recipe_tags where recipe_tags.tag_id = tags.id)`);

  return rows;
}
