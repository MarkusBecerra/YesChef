# YesChef

A single-user, mobile-first recipe log: track what I've actually cooked, how it went, and (eventually) plan the week and build the shopping list from that history.

**MVP features**

- Recipe database: ingredients, steps, times, servings/yield, difficulty, category, tags, source, cost, notes, photo
- Import from a link: schema.org recipe data first, an AI parser (Claude or Gemini) for unstructured pages, manual cleanup before saving
- Cook log: log each cook with a date, optional rating, and notes; cook count and history per recipe
- Search across title, ingredients, and tags; filter by favorites, difficulty, tag; seven sort orders
- Light and dark theme (system default with a manual toggle), installable as a PWA, behind a passphrase gate

## Stack

- **Next.js 16** (App Router, TypeScript) with **Tailwind CSS v4**
- **Drizzle ORM** on **libSQL/SQLite**: a local file in development, [Turso](https://turso.tech) in production
- **Vercel Blob** for photos in production, the local filesystem in development
- **Claude** (`@anthropic-ai/sdk`, default) or **Gemini** (`@google/genai`) for parsing recipes out of unstructured pages
- **Vitest** for unit and in-memory database tests
- Hosted on **Vercel**

### Layering

The app is deliberately layered so the backend can be lifted out later (for example to share it with an iOS app):

| Layer | Where | Notes |
| --- | --- | --- |
| Domain logic | `src/server/` | Plain TypeScript, no Next.js imports: DB schema and queries, validation, import parsing, storage, LLM calls |
| JSON API | `src/app/api/v1/` | Thin route handlers over the domain layer. Auth accepts the browser cookie **or** `Authorization: Bearer <token>` |
| Web UI | `src/app/(app)/`, `src/components/` | Server components read through the domain layer directly; client forms call the API |

To move off Next.js one day: mount `src/server/` in another HTTP framework, point the clients at it, done. Turso is standard SQLite, so the data moves anywhere.

## Getting started

```bash
npm install
cp .env.example .env.local   # set APP_PASSPHRASE at minimum
npm run dev                   # runs the migrations, then starts on http://localhost:3000
```

Sign in with the passphrase from `.env.local`. Recipes go into `data/yeschef.db` and photos into `data/uploads/` (both gitignored).

To try link import on pages without structured recipe data, add `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`) to `.env.local`. Recipe blogs with schema.org data import without any key.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Migrate the local DB, then start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Vitest (unit tests + service tests on an in-memory database) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Drizzle Studio for browsing the database |

## API

All endpoints live under `/api/v1` and return JSON. Authenticate with the session cookie (browser) or `Authorization: Bearer <token>`, where the token comes from `POST /api/v1/auth/login {"passphrase"}`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST / POST | `/auth/login`, `/auth/logout` | Get or clear a session |
| GET | `/recipes?q=&tag=&difficulty=&favorite=1&sort=` | List (sorts: `updated`, `created`, `title`, `lastCooked`, `cookCount`, `ingredientCount`, `totalTime`) |
| POST | `/recipes` | Create (optionally with `photoSourceUrl` to copy a remote image) |
| GET / PUT / PATCH / DELETE | `/recipes/:id` | Read, replace, partially update (`isFavorite`), delete |
| POST / DELETE | `/recipes/:id/photo` | Upload (multipart `file`) or remove the photo |
| POST | `/recipes/:id/cooks` | Log a cook (`cookedOn`, `rating`, `notes`) |
| PATCH / DELETE | `/cooks/:id` | Edit or remove a cook log entry |
| GET | `/tags` | Tags in use with counts |
| POST | `/import` | `{ url }` → a recipe draft to review |

## Deploying to Vercel

1. **Database (Turso).** Create a database, then copy its URL and an auth token:
   ```bash
   turso db create yeschef
   turso db show yeschef --url
   turso db tokens create yeschef
   ```
2. **Photos (Vercel Blob).** In the Vercel project: Storage → Create → Blob. Connecting it adds `BLOB_READ_WRITE_TOKEN` to the project automatically.
3. **Environment variables** (Project → Settings → Environment Variables), for Production and Preview:
   - `APP_PASSPHRASE`: a long passphrase
   - `DATABASE_URL`: the `libsql://…` URL from step 1
   - `DATABASE_AUTH_TOKEN`: the token from step 1
   - `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`): optional, enables AI parsing on import
4. **Deploy.** Import the GitHub repo in Vercel. The `vercel-build` script runs the migrations against Turso and then builds, so every deploy keeps the schema current.
5. **Domain.** Add your domain under Project → Settings → Domains and point the registrar's DNS at Vercel. On the phone, open the site in Chrome and choose "Add to Home screen" to install it.

Preview deployments share the same database and blob store unless you give the Preview environment its own values.

## License

MIT, see [LICENSE](LICENSE).
