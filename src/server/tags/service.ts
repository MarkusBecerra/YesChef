import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { recipeTags, tags } from "@/server/db/schema";
import type { TagSummary } from "@/server/recipes/types";

/** Every tag with how many recipes use it, most-used first. Unused tags are pruned as we go. */
export async function listTags(): Promise<TagSummary[]> {
  const db = getDb();
  const count = sql<number>`count(${recipeTags.recipeId})`.mapWith(Number);
  const rows = await db
    .select({ id: tags.id, name: tags.name, recipeCount: count })
    .from(tags)
    .leftJoin(recipeTags, eq(recipeTags.tagId, tags.id))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(count), asc(tags.name));

  const unused = rows.filter((r) => r.recipeCount === 0);
  if (unused.length) {
    await db.delete(tags).where(
      sql`${tags.id} in (${sql.join(
        unused.map((r) => sql`${r.id}`),
        sql`, `,
      )})`,
    );
  }
  return rows.filter((r) => r.recipeCount > 0);
}
