# YesChef

A single-user, mobile-first recipe log: track what I've actually cooked, how it went, and (eventually) plan the week and build the shopping list from that history.

## Stack

- **Next.js 16** (App Router, TypeScript) with **Tailwind CSS v4**
- **Drizzle ORM** on **libSQL/SQLite** – a local file in development, [Turso](https://turso.tech) in production
- **Vercel Blob** for recipe photos in production, the local filesystem in development
- **Claude** (pluggable to Gemini) for parsing recipes out of unstructured pages when importing by link
- Hosted on **Vercel**

The app is deliberately layered so the backend can be lifted out later: everything under `src/server/` is plain TypeScript with no Next.js imports, and the web UI talks to a JSON API under `/api/v1/` that a native client could use too.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and sign in with the passphrase from `.env.local`.

## Scripts

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the dev server                  |
| `npm run build`     | Production build                      |
| `npm run start`     | Serve the production build            |
| `npm run lint`      | ESLint                                |
| `npm run typecheck` | TypeScript, no emit                   |

## License

MIT – see [LICENSE](LICENSE).
