import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "@/server/db/client";
import { cookLogs, ingredients, inviteCodes, recipeTags, recipes, steps, tags, users } from "@/server/db/schema";
import { nowIso } from "@/server/recipes/values";

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
  await db.delete(inviteCodes);
  await db.delete(users);
}

/**
 * A user row written straight to the database. Tests that only need an owner for their
 * recipes skip signUp (and its deliberately slow password hashing) this way.
 */
export async function createTestUser(
  overrides: Partial<{ email: string; name: string; role: "owner" | "member" }> = {},
): Promise<number> {
  const db = getDb();
  const now = nowIso();
  const [row] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `cook-${crypto.randomUUID()}@example.com`,
      name: overrides.name ?? "Test Cook",
      passwordHash: "pbkdf2$sha256$1000$AAAA$AAAA",
      role: overrides.role ?? "owner",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: users.id });
  return row.id;
}
