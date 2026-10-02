# syntax=docker/dockerfile:1
# One image recipe for the three apps in this monorepo (build from the repository root):
#   docker build -f docker/app.Dockerfile --build-arg APP=web   .
#   docker build -f docker/app.Dockerfile --build-arg APP=admin .
#   docker build -f docker/app.Dockerfile --build-arg APP=api   .

FROM node:22-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN npm ci

FROM node:22-slim AS builder
ARG APP
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$APP" && npm run build -w @longrak/$APP

FROM node:22-slim AS runner
ARG APP
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone build keeps the monorepo layout: server.js lives in apps/$APP.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static

# Database scripts (make-admin, SQLite → Postgres copy) and the plain driver they need; run them in the api container.
COPY --from=builder --chown=nextjs:nodejs /repo/packages/db/scripts ./scripts
COPY --from=deps --chown=nextjs:nodejs /repo/node_modules/postgres ./node_modules/postgres
# Where the old SQLite file is mounted for that copy.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV APP=${APP}
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
