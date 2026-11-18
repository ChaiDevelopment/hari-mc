# syntax=docker/dockerfile:1.7
# Image produksi API NestJS (Hari MC Booking).
# Build dari ROOT repo (butuh pnpm-lock.yaml workspace):
#   docker build -f apps/api/Dockerfile -t hari-mc-api .
# Jalankan:
#   docker run -p 4100:4100 --env-file apps/api/.env.production hari-mc-api
# Cocok untuk Cloudflare Containers, Railway, Render, Fly.io, atau VPS.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Build (semua dependency, compile TypeScript) ──
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @hmc/api...
COPY apps/api apps/api
RUN pnpm --filter @hmc/api exec prisma generate && pnpm --filter @hmc/api build

# ── Dependency produksi saja (+ Prisma CLI & tsx untuk migrate/seed/provision) ──
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --prod --filter @hmc/api... && pnpm --filter @hmc/api exec prisma generate

# ── Runtime ──
FROM base AS runtime
ENV NODE_ENV=production PORT=4100
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json apps/api/docker-entrypoint.sh ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/scripts ./apps/api/scripts
WORKDIR /app/apps/api
RUN chmod +x docker-entrypoint.sh && mkdir -p storage && chown -R node:node storage
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
