import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "@/server/db/client";
import { cookLogs, ingredients, recipeTags, recipes, steps, tags } from "@/server/db/schema";

/** Apply the real migrations to the in-memory test database. Call once per test file. */
export async function migrateTestDb() {
  const db = getDb();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

/** Wipe every table between tests. */
export async function resetTestDb() {
  const db = getDb();
  await db.delete(cookLogs);
  await db.delete(recipeTags);
  await db.delete(ingredients);
  await db.delete(steps);
  await db.delete(recipes);
  await db.delete(tags);
}
