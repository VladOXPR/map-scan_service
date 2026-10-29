FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/theme/package.json packages/theme/package.json
COPY packages/assets/package.json packages/assets/package.json
RUN npm install --workspace=@cuub/web --include-workspace-root --no-audit --no-fund
# The website pins its own TypeScript, which npm nests here; the root one (6.x) fails the build.
RUN mkdir -p apps/web/node_modules

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN npm run web:build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/packages/assets ./apps/web/public/assets
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/package.json ./package.json

WORKDIR /app/apps/web
CMD ["npx", "next", "start", "-p", "8080"]
