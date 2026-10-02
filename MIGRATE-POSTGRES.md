# Moving the server from SQLite to PostgreSQL

The app now stores everything in PostgreSQL (`db` service in `docker/docker-compose.yml`) and runs as three containers: `web` (public site), `admin` (admin console) and `api` (backend). Commands below are run from the repository root; `dc` stands for `docker compose --project-directory . -f docker/docker-compose.yml`. Existing accounts,
chats, catalog, plans and codes live in the old SQLite file inside the `dreamchat-data` volume and are
copied over once with `scripts/sqlite-to-postgres.mjs`.

The copy reads `dreamchat.db` **together with** `dreamchat.db-wal`; most recent rows are only in the
`-wal` file. Run it inside the api container (where the volume is mounted) and never copy the `.db`
file on its own.

## Steps (on the server, in the project folder)

1. Back up the SQLite volume:

   ```sh
   docker run --rm -v dreamchat_dreamchat-data:/data -v "$PWD":/backup alpine \
     tar czf /backup/dreamchat-sqlite-$(date +%F).tgz -C /data .
   ```

2. Add the database password and the admin-proxy secret to `.env` (hex, since the password goes into a URL):

   ```sh
   echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
   echo "ADMIN_PROXY_SECRET=$(openssl rand -hex 32)" >> .env
   ```

   In the Cloudflare tunnel, point `longrakchat.com` at `http://web:3000` (it was `http://app:3000`)
   and add `admin.longrakchat.com` → `http://admin:3000`, ideally behind Cloudflare Access.

3. Take the site offline (stop the tunnel and the app), pull the new code, and start only the app
   and the database. The app creates the Postgres schema on start. The tunnel stays down, so nobody
   can sign up before the copy (a new account could take an id an old account needs).

   ```sh
   docker compose --profile tunnel stop cloudflared app   # the old single container, from the old compose file
   git pull
   dc up -d --build api web admin
   ```

4. Copy the data (safe to run again; it updates rows and never deletes):

   ```sh
   dc exec api node scripts/sqlite-to-postgres.mjs /app/data/dreamchat.db
   ```

   It prints how many rows it copied per table. Sign in over the tailnet address
   (port 3200 for the site, 3201 for the admin console) with an existing account and open a chat to check, then bring the site back:

   ```sh
   dc --profile tunnel up -d
   docker rm dreamchat-app   # the old container, no longer used
   ```

5. Give your account admin rights. `ADMIN_USERNAMES` no longer does anything (anyone could register
   a listed name before you), so do this once per admin:

   ```sh
   dc exec api node scripts/make-admin.mjs <your-username>
   ```

6. Back up Postgres from now on:

   ```sh
   dc exec db pg_dump -U longrak longrak | gzip > longrak-$(date +%F).sql.gz
   ```

Once you've checked the data, you can drop the `dreamchat-data` volume line from `docker-compose.yml`.
Keep the backup from step 1.

## Local development

See README.md. In short: a Postgres for `apps/api/.env.local`, then `npm install` and `npm run dev`.
