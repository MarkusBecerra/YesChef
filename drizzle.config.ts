import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env.local / .env exactly the way Next.js does, so CLI commands see the same values.
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL?.trim() || "file:./data/yeschef.db";
// drizzle-kit won't create the folder for a local file database, so do it here.
if (url.startsWith("file:") && !url.includes(":memory:")) mkdirSync(dirname(url.slice("file:".length)), { recursive: true });

export default defineConfig({
  dialect: "turso",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
  },
});
