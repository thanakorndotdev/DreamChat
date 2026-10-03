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

The public site starts with a landing page at `/`, including current packages from the billing API.
The character catalog and private chats live at `/chat`; `/chat?login=1` opens sign-in directly.
Package links lead to `/membership`, which supports signing in, completing consent and redeeming codes.
Paid checkout is available when the existing Stripe configuration is enabled.

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

## Admin console

The admin app runs separately from the public site and is reachable over the server's tailnet on
port `3201`. To publish it through a dedicated Cloudflare Tunnel:

1. Create a Cloudflared tunnel in Cloudflare Zero Trust.
2. Add the public hostname `admin.longrakchat.com` with service `http://admin:3000`.
3. Add a Cloudflare Access self-hosted application for `admin.longrakchat.com` and restrict it to
   the people who operate the site.
4. Put its token in the root `.env` as `CLOUDFLARE_ADMIN_TUNNEL_TOKEN=...` and run:

   ```sh
   sh scripts/start-admin-tunnel.sh
   ```

The script refuses to start when the token is missing. The admin tunnel is independent from the
public-site tunnel, and the API has no public hostname. To grant an existing account access:

```sh
docker compose --project-directory . -f docker/docker-compose.yml exec api node scripts/make-admin.mjs <username>
```

## Character pictures (ComfyUI + Flux.1)

The create-character wizard draws covers on our own GPU. The api calls ComfyUI server-side
(`apps/api/lib/comfyui.ts`); browsers never reach it, and the plan decides pictures per day and
quality (Plans tab in the admin console: standard 576×768, HD 768×1024, premium 896×1184).

1. Run ComfyUI on the GPU box, e.g. as a `comfyui` service in the `local-llm` stack next to Ollama,
   listening on 8188.
2. Download the all-in-one checkpoint `flux1-schnell-fp8.safetensors` (Hugging Face
   `Comfy-Org/flux1-schnell`) into `ComfyUI/models/checkpoints/`. Flux.1 [schnell] is Apache-2.0.
3. Optional, for premium: `flux1-dev-fp8.safetensors` (`Comfy-Org/flux1-dev`) and set
   `COMFYUI_FLUX_DEV_CHECKPOINT`. Flux.1 [dev] needs a commercial licence for a paid service.
4. Set `COMFYUI_URL=http://comfyui:8188` in `.env` and restart the api. The admin Settings tab
   shows whether it answers.

Moving an existing SQLite install over: see `MIGRATE-POSTGRES.md`.
