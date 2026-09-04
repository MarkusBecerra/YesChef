import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const DEFAULT_DATABASE_URL = "file:./data/yeschef.db";

export function createDb(url: string, authToken?: string) {
  // Local file databases: make sure the folder exists so first run just works.
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  const client: Client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

// Cache on globalThis so dev-server hot reloads reuse one connection.
const globalForDb = globalThis as unknown as { __yeschefDb?: Db };

/** The app database: a local SQLite file by default, Turso (libSQL) when DATABASE_URL points there. */
export function getDb(): Db {
  if (!globalForDb.__yeschefDb) {
    globalForDb.__yeschefDb = createDb(
      process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
      process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
    );
  }
  return globalForDb.__yeschefDb;
}
