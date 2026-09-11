# YesChef

A small, mobile-first recipe log: track what I've actually cooked, how it went, and (eventually) plan the week and build the shopping list from that history. Invite-only - the owner plus a handful of people they cook with, each with their own shelf.

**MVP features**

- Recipe database: ingredients, steps, times, servings/yield, difficulty, category, tags, source, cost, notes, photo
- Import from a link: schema.org recipe data first, an AI parser (Claude or Gemini) for unstructured pages, manual cleanup before saving
- **Import by talking**: describe a recipe you know by heart and the app writes it down, then asks about whatever you left out
- **Import from a photo**: snap a handwritten card, a cookbook page or a clipping and the app reads it into the form, marking anything it couldn't make out
- Cook log: log each cook with a date, optional rating, and notes; cook count and history per recipe
- Search across title, ingredients, and tags; filter by favorites, difficulty, tag; seven sort orders
- Accounts, gated by single-use invite codes only the owner can see and hands out from the Account page
- Light and dark theme (system default with a manual toggle), installable as a PWA

## Roadmap

From the [design doc](https://claude.ai/code/artifact/355aac9b-df7e-457e-9adc-9a3a0827397f), in priority order:

- [x] Recipe database
- [x] Import via link (schema.org first, AI fallback for unstructured pages)
- [x] Import via pasted text and YouTube/Shorts video
- [x] Import by talking (voice, with follow-up questions)
- [x] Import from a photo of a recipe card or cookbook page
- [x] Cook log & mastery tracking (cook count + history)
- [x] Tags, categories & search
- [x] Invite-only accounts
- [ ] Meal plan generation
- [ ] Shopping list generation
- [ ] AI recipe lookup & generation from stored preferences
- [ ] "What can I make?" ingredient tracker
- [ ] Smart standing preferences
- [ ] Macro tracking

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

Every recipe belongs to a user, and every read and write in the domain layer takes that user's id as its first argument - there is no query in the app that spans accounts.

To move off Next.js one day: mount `src/server/` in another HTTP framework, point the clients at it, done. Turso is standard SQLite, so the data moves anywhere.

## Getting started

```bash
npm install
cp .env.example .env.local   # set AUTH_SECRET and OWNER_INVITE_CODE at minimum
npm run dev                   # runs the migrations, then starts on http://localhost:3000
```

The first visit offers to create the owner account: use `OWNER_INVITE_CODE` from `.env.local` as the code. After that, invite codes are minted on the **Account** page and are the only way anybody else can sign up. Recipes go into `data/yeschef.db` and photos into `data/uploads/` (both gitignored).

Upgrading an install that predates accounts: `APP_PASSPHRASE` doubles as both `AUTH_SECRET` and the setup code, so nothing has to change before the deploy. Sign up once with it - the first account created claims every recipe already in the database - then switch to the two new variables.

To try link import on pages without structured recipe data - or import by talking, which is always AI - add `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`) to `.env.local`. Recipe blogs with schema.org data import without any key.

### Importing by talking

"Speak it" on the import screen records a recipe the way you'd tell it to a friend. Where the browser has dictation of its own (Chrome, Edge, Safari) it does the transcribing, so no audio reaches this app and no Gemini key is needed - note that those browsers generally do it by sending the audio to Google's or Apple's speech service, the same one behind the keyboard's microphone button, rather than on the device. Browsers without dictation record audio and post it to `/api/v1/import/voice/audio`, which needs `GEMINI_API_KEY` - no Claude model takes audio. Either way the transcript is shown for correction first, and after the recipe is written the model asks about the things a cook would need that never got said (quantities, oven temperature, servings); answer what you know, skip the rest, and finish it in the form.

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

All endpoints live under `/api/v1` and return JSON. Authenticate with the session cookie (browser) or `Authorization: Bearer <token>`, where the token comes from `POST /api/v1/auth/login {"email","password"}`. Everything below is scoped to the account behind that token.

| Method | Path | Purpose |
| --- | --- | --- |
| POST / POST | `/auth/login`, `/auth/logout` | Get or clear a session |
| POST | `/auth/signup` | `{ name, email, password, inviteCode }` → creates an account and signs it in |
| GET | `/auth/me` | The signed-in account |
| PATCH / POST | `/account`, `/account/password` | Rename or re-address the account; change the password (signs out every other session) |
| GET / POST / DELETE | `/invites`, `/invites/:id` | Owner only: list, mint, cancel invite codes |
| GET | `/recipes?q=&tag=&difficulty=&favorite=1&sort=` | List (sorts: `updated`, `created`, `title`, `lastCooked`, `cookCount`, `ingredientCount`, `totalTime`) |
| POST | `/recipes` | Create (optionally with `photoSourceUrl` to copy a remote image) |
| GET / PUT / PATCH / DELETE | `/recipes/:id` | Read, replace, partially update (`isFavorite`), delete |
| POST / DELETE | `/recipes/:id/photo` | Upload (multipart `file`) or remove the photo |
| POST | `/recipes/:id/cooks` | Log a cook (`cookedOn`, `rating`, `notes`) |
| PATCH / DELETE | `/cooks/:id` | Edit or remove a cook log entry |
| GET | `/tags` | Tags in use with counts |
| POST | `/import` | `{ url }` → a recipe draft to review |
| POST | `/import/text` | `{ text, sourceUrl? }` → a recipe draft from pasted text |
| POST | `/import/voice` | `{ transcript, previous?, answers? }` → a draft plus follow-up questions |
| POST | `/import/voice/audio` | multipart `audio` → `{ transcript }` |
| POST | `/import/photo` | multipart `photo` (a recipe card or cookbook page) → a recipe draft to review |

## Deploying to Vercel

1. **Database (Turso).** Create a database, then copy its URL and an auth token:
   ```bash
   turso db create yeschef
   turso db show yeschef --url
   turso db tokens create yeschef
   ```
2. **Photos (Vercel Blob).** In the Vercel project: Storage → Create → Blob. Connecting it adds `BLOB_READ_WRITE_TOKEN` to the project automatically.
3. **Environment variables** (Project → Settings → Environment Variables), for Production and Preview:
   - `AUTH_SECRET`: a long random string (changing it signs everyone out)
   - `OWNER_INVITE_CODE`: the one-time code that creates the owner account
   - `DATABASE_URL`: the `libsql://…` URL from step 1
   - `DATABASE_AUTH_TOKEN`: the token from step 1
   - `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`): optional, enables AI parsing on import. For Claude without any key, see [Keyless Claude access](#keyless-claude-access) below.
4. **Deploy.** Import the GitHub repo in Vercel. The `vercel-build` script runs the migrations against Turso and then builds, so every deploy keeps the schema current.
5. **Domain.** Add your domain under Project → Settings → Domains and point the registrar's DNS at Vercel. On the phone, open the site in Chrome and choose "Add to Home screen" to install it.

Preview deployments share the same database and blob store unless you give the Preview environment its own values.

### Keyless Claude access

Instead of storing an Anthropic API key, the app can use [Workload Identity Federation](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation): Vercel signs a short-lived OIDC token for each request, and the Anthropic SDK exchanges it for a short-lived Anthropic token. Nothing long-lived is stored anywhere.

1. In Vercel: Project → Settings → Security → enable **Secure backend access with OIDC federation** in *Team* issuer mode.
2. In the Claude Console: Settings → Workload identity → **Connect workload** → Custom OIDC. Issuer URL `https://oidc.vercel.com/<team-slug>`, subject prefix `owner:<team-slug>:project:<project-name>:*`, audience `https://api.anthropic.com`. Raise the issuer's maximum token lifetime to 12 hours (Vercel function tokens last 2 hours, development tokens 12).
3. Add the IDs the wizard shows to the Vercel project (they are not secrets): `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`. Leave `ANTHROPIC_API_KEY` unset, since a key takes precedence.
4. Locally, `npx vercel link` then `npx vercel env pull` writes a development `VERCEL_OIDC_TOKEN` into `.env.local`; add the same four IDs there.

## License

MIT, see [LICENSE](LICENSE).
