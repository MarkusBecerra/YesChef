<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# YesChef project notes

Single-user recipe log. Design doc decisions: Next.js 16 on Vercel, Turso (libSQL) + Vercel Blob in prod, local SQLite file + `data/uploads/` in dev, Claude (pluggable to Gemini) for link import, passphrase gate instead of auth.

## Layout

- `src/server/` - domain layer, **no Next.js imports**: `db/` (Drizzle schema + client), `recipes/`, `cooks/`, `tags/` (services + Zod contracts), `storage/` (photo adapters), `import/` (URL import, JSON-LD, LLM providers), `auth/session.ts`.
- `src/app/api/v1/` - JSON route handlers over the domain layer. Also the contract a native client would use.
- `src/app/(app)/` - gated pages (`force-dynamic`); `src/app/login`; `src/proxy.ts` is the gate.
- `src/components/` - UI; `src/lib/` - client-safe helpers (`api.ts` fetch wrapper, formatting, form<->payload mapping).

## Commands

`npm run dev` (migrates first), `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Run all four checks before committing. After editing `src/server/db/schema.ts`: `npm run db:generate` and commit the new files under `drizzle/`.

## Gotchas learned the hard way

- Never call a function exported from a `"use client"` module inside a server component - it throws at request time ("Attempted to call X() from the server"), not at build time. Pure helpers go in `src/lib/` or `src/server/`.
- In a single-table Drizzle select, column references inside raw `sql\`...\`` fragments in the **select list** lose their table qualifier. Write correlated subqueries with literal table names (see `cookCountSql` in `src/server/recipes/service.ts`).
- Route types (`PageProps`, `RouteContext`) come from `npx next typegen`; run it before `tsc` when routes change.
- The React Compiler lint rules reject `setState` inside effects; use `useSyncExternalStore` for mount flags and derive-during-render for prop->state sync.
- Locally served photos (`/api/v1/uploads/...`) bypass `next/image` optimisation because the optimiser's fetch carries no session cookie.
- Tests run against an in-memory libSQL database with the real migrations (`src/test/db.ts`).
- Claude auth: `src/server/import/llm/auth.ts` picks an API key first, else Workload Identity Federation (Vercel OIDC token with audience `https://api.anthropic.com`, exchanged by the SDK). The identity token is only available inside a request on Vercel, so never fetch it at module scope.
- Import providers split by job: text extraction follows `LLM_PROVIDER` (Claude by default here), but watching a YouTube video is Gemini-only - `getVideoExtractor()` keys off `GEMINI_API_KEY` alone, because no Claude model takes video.
