FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# patchedDependencies in package.json needs patches/ before pnpm install
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/dist ./dist
COPY docker/entrypoint.sh ./docker/entrypoint.sh
# Desde builder (repo completo), no solo del contexto del host
COPY --from=builder /app/scripts/envForCli.mjs ./scripts/envForCli.mjs
COPY --from=builder /app/scripts/create-superuser.mjs ./scripts/create-superuser.mjs
COPY --from=builder /app/scripts/migrate-agrogana-from-backup.mjs ./scripts/migrate-agrogana-from-backup.mjs
COPY --from=builder /app/scripts/pre-push-schema-compat.mjs ./scripts/pre-push-schema-compat.mjs

# Windows checkouts suelen guardar .sh con CRLF; el shebang /bin/sh\r rompe el arranque ("no such file or directory").
RUN sed -i 's/\r$//' ./docker/entrypoint.sh && chmod +x ./docker/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/bin/sh", "/app/docker/entrypoint.sh"]
