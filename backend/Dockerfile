# syntax=docker/dockerfile:1

# Pinned by digest to prevent supply-chain attacks; renovate this regularly.
# hadolint ignore=DL3007
FROM node:24.18.0-alpine3.24@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Upgrade all packages first to pull the latest security patches for the
# Alpine 3.24 base. Then install a recent OpenSSL to replace the bundled
# libcrypto/libssl shipped in node:24.18.0 (which is affected by CVE-2026-31789
# critical + 6 high CVEs in OpenSSL 3.5.5).
RUN apk upgrade --no-cache \
    && apk add --no-cache "openssl>=3.5.6-r0" \
    && corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json ./
# Skip lifecycle scripts (postinstall runs `prisma generate`, which requires
# `prisma/schema.prisma` to already be present). We generate the client later
# in the `builder` stage once both schema and source are copied in.
RUN npm ci --ignore-scripts

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

FROM builder AS production-deps

RUN npm prune --omit=dev && npm cache clean --force

FROM base AS development

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

FROM base AS runner

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs --home /nonexistent --shell /sbin/nologin nestjs

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=production-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main"]
