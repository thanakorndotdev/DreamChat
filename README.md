# หลงรักแชท

Roleplay chat with characters, as a reading site. npm-workspaces monorepo:

| Folder | What | Dev port | Production |
|---|---|---|---|
| `apps/web` | Public site (Next.js): lobby, chat, membership, privacy/terms | 3100 | `web` container, longrakchat.com |
| `apps/admin` | Admin console (Next.js), its own sign-in | 3101 | `admin` container, admin.longrakchat.com |
| `apps/api` | Backend (Next.js route handlers only): every `/api` route, AI, Stripe | 4100 | `api` container, internal only |
| `packages/shared` | Types, plans, ages, legal rules, shared CSS and Modal/Toast | | |
| `packages/db` | Postgres connection + migrations, and the `make-admin` / SQLite-copy scripts | | |
| `docker/` | `app.Dockerfile` (one recipe, `APP=web\|admin\|api`) and `docker-compose.yml` | | |

The web and admin apps never talk to the database. Their `proxy.ts` forwards `/api/*` to the api,
so the browser stays on one origin per app. The admin app stamps `ADMIN_PROXY_SECRET` on what it
forwards and only forwards sign-in plus `/api/admin/*`; the api refuses admin endpoints without it,
and the web app refuses to forward them at all.

## Develop

```sh
# a throwaway Postgres
docker run -d --name longrak-pg-dev -e POSTGRES_USER=longrak -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=longrak -p 127.0.0.1:5433:5432 postgres:16-alpine
echo 'DATABASE_URL=postgres://longrak:devpass@127.0.0.1:5433/longrak' > apps/api/.env.local

npm install
npm run dev          # api :4100, web :3100, admin :3101
npm run typecheck
```

The schema is created on the api's first request. Make yourself an admin after signing up:
`DATABASE_URL=… npm run make-admin -- <username>`.

## Deploy

Fill in `.env` (see `.env.example`), then from the repository root:

```sh
npm run docker:up      # docker compose --project-directory . -f docker/docker-compose.yml --profile tunnel up -d --build
```

Moving an existing SQLite install over: see `MIGRATE-POSTGRES.md`.
