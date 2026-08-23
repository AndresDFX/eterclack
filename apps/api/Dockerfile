# ─── Base ────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
# openssl: requerido por los engines de Prisma en alpine
RUN apk add --no-cache openssl

# ─── Dependencias ────────────────────────────────────────────────
FROM base AS deps
COPY package.json ./
COPY apps/api/package.json apps/api/
# npm workspaces eleva las dependencias a /app/node_modules;
# el mkdir garantiza que el directorio exista para el COPY de abajo.
RUN npm install --no-audit --no-fund && mkdir -p apps/api/node_modules

# ─── Desarrollo (hot reload vía bind mount) ──────────────────────
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api ./apps/api
COPY package.json ./
WORKDIR /app/apps/api
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── Build de producción ─────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./apps/api
COPY package.json ./
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# ─── Producción ──────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
