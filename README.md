# nexusdashboard

Cofundr investor portal — retail/corporate investor, CEO/admin and issuer dashboards.

The original single-file prototype lives at `legacy/prototype.html` for reference.
The app is being rebuilt as a full-stack Cloudflare Workers app: React (Vite) frontend
+ Hono API + D1 database, deployed together as one Worker. See
`.claude/plans` (or ask Claude) for the full rebuild plan and phase status.

## Structure

- `apps/web` — React + TypeScript + Vite frontend
- `apps/api` — Hono API Worker (`wrangler`'s `main`), Drizzle ORM + Cloudflare D1
- `packages/shared` — types shared by both

## Local development

```
npm install
npm run db:migrate:local --workspace apps/api   # first time / after schema changes
npm run dev:api                                  # terminal 1: wrangler dev on :8787
npm run dev:web                                  # terminal 2: vite dev server, proxies /api to :8787
```

## Deploy

```
npm run deploy   # builds apps/web then `wrangler deploy`
```

Requires `CLOUDFLARE_API_TOKEN` for CI/non-interactive deploys (see `.github/workflows/ci.yml`).
