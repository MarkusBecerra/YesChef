<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# YesChef project notes

Invite-only recipe log for the owner and the handful of people they cook with. Design doc decisions: Next.js 16 on Vercel, Turso (libSQL) + Vercel Blob in prod, local SQLite file + `data/uploads/` in dev, Claude (pluggable to Gemini) for link, text and spoken-recipe import.

## Layout

- `src/server/` - domain layer, **no Next.js imports**: `db/` (Drizzle schema + client), `recipes/`, `cooks/`, `tags/` (services + Zod contracts), `storage/` (photo adapters), `import/` (URL, text and voice import, JSON-LD, LLM providers), `auth/` (`session.ts` token signing, `password.ts`, `service.ts` accounts + invites).
- `src/app/api/v1/` - JSON route handlers over the domain layer. Also the contract a native client would use.
- `src/app/(app)/` - gated pages (`force-dynamic`), including `account/`; `src/app/login` and `src/app/signup` are the public ones; `src/proxy.ts` is the gate.
- `src/components/` - UI; `src/lib/` - client-safe helpers (`api.ts` fetch wrapper, formatting, form<->payload mapping) **except `current-user.ts`, which is server-only**: it is the one place Next's `cookies()`/`headers()` meet the session logic, and every page and route handler gets its user from it.

## Commands

`npm run dev` (migrates first), `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Run all four checks before committing. After editing `src/server/db/schema.ts`: `npm run db:generate` and commit the new files under `drizzle/`.

## Accounts

- Every recipe has a `user_id`, and every service function takes the user's id first (`listRecipes(userId, query)`, `getRecipe(userId, id)`, ...). Nothing in the app queries across accounts; the cross-account test in `recipes/service.test.ts` is what keeps it that way.
- Sessions are stateless: a token is `v1.<userId>.<tokenVersion>.<issuedAt>.<hmac>` signed with `AUTH_SECRET`. The proxy only checks the signature (it cannot reach the database, and Next's own guidance is that a proxy is an optimistic check); `getCurrentUser()` re-checks `tokenVersion` against the row, which is what makes a password change sign the other devices out.
- Sign-up is invite-only. The first account ever created uses `OWNER_INVITE_CODE` (or the legacy `APP_PASSPHRASE`), becomes the owner, and claims every recipe with a null `user_id` - that is the upgrade path from the single-user version. Every later account spends a single-use code the owner minted; invite codes are stored in plain text on purpose, because the owner has to be able to read one back to re-send it. There is no headcount limit anywhere - the single-use code is the only gate, and only the owner can mint one.
- `user_id` is nullable in the schema and its migration adds it without a cascade; account deletion isn't implemented, so nothing depends on one.

## Gotchas learned the hard way

- Never call a function exported from a `"use client"` module inside a server component - it throws at request time ("Attempted to call X() from the server"), not at build time. Pure helpers go in `src/lib/` or `src/server/`.
- In a single-table Drizzle select, column references inside raw `sql\`...\`` fragments in the **select list** lose their table qualifier. Write correlated subqueries with literal table names (see `cookCountSql` in `src/server/recipes/service.ts`).
- Route types (`PageProps`, `RouteContext`) come from `npx next typegen`; run it before `tsc` when routes change.
- The React Compiler lint rules reject `setState` inside effects; use `useSyncExternalStore` for mount flags and derive-during-render for prop->state sync.
- Locally served photos (`/api/v1/uploads/...`) bypass `next/image` optimisation because the optimiser's fetch carries no session cookie.
- Tests run against an in-memory libSQL database with the real migrations (`src/test/db.ts`).
- Claude auth: `src/server/import/llm/auth.ts` picks an API key first, else Workload Identity Federation (Vercel OIDC token with audience `https://api.anthropic.com`, exchanged by the SDK). The identity token is only available inside a request on Vercel, so never fetch it at module scope.
- Import providers split by job: text extraction follows `LLM_PROVIDER` (Claude by default here), but watching a YouTube video is Gemini-only - `getVideoExtractor()` keys off `GEMINI_API_KEY` alone, because no Claude model takes video. Transcribing a recording is Gemini-only for the same reason (`getAudioTranscriber()`); the spoken-recipe *extraction* is a normal text call and follows `LLM_PROVIDER` like the rest.
- Photo import (`/api/v1/import/photo`, a photo of a recipe card or cookbook page) follows `LLM_PROVIDER` like text: both Claude and Gemini take images. The browser shrinks the photo with the same `compressImage` as the recipe photo before upload, which is also what turns an iPhone's HEIC into a JPEG the models accept.
- Voice import prefers the browser's own dictation (`SpeechRecognition`), so on Chrome/Edge/Safari no audio reaches our server and no Gemini key is needed. That is not the same as on-device: Chromium and Safari generally hand the audio to Google's or Apple's speech service to transcribe. Uploading audio to `/api/v1/import/voice/audio` is the fallback for browsers without dictation.
- The voice extractor returns the draft *plus* `followUps`; the questions are answered before the form opens, and the answers are sent back with the first draft as `previous` so the model edits rather than starts over.
