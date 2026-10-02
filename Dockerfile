# syntax=docker/dockerfile:1

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# One-off SQLite → Postgres copy: docker compose exec app node scripts/sqlite-to-postgres.mjs /app/data/dreamchat.db
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
# The app bundles its own copy of the driver; the script needs a plain one (it has no dependencies).
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
# Where the old SQLite file is mounted for that copy.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
