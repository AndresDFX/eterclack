FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund && mkdir -p apps/web/node_modules

FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY apps/web ./apps/web
COPY package.json ./
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web
COPY package.json ./
WORKDIR /app/apps/web
RUN npm run build

# Producción: estáticos servidos por Caddy en el VPS
FROM caddy:2-alpine AS prod
COPY --from=build /app/apps/web/dist /srv/web
