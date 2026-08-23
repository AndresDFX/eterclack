# ════════════════════════════════════════════════════════════════
#  EterClack — imagen de producción
#
#  Un solo contenedor sirve la API y el frontend compilado. No es
#  pereza: `onrender.com` está en la Public Suffix List, así que dos
#  subdominios son sitios DISTINTOS y la cookie de sesión SameSite=Lax
#  no viajaría entre ellos. Un único origen resuelve el problema sin
#  debilitar la cookie a SameSite=None, y de paso elimina el CORS.
# ════════════════════════════════════════════════════════════════

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ─── Dependencias ────────────────────────────────────────────────
FROM base AS deps
COPY package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund

# ─── Frontend ────────────────────────────────────────────────────
# La API vive en el mismo origen, así que VITE_API_URL queda vacío y
# las peticiones salen como rutas relativas.
FROM base AS web
ENV VITE_API_URL=""
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build

# ─── API ─────────────────────────────────────────────────────────
FROM base AS api
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# ─── Imagen final ────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
ENV SERVE_WEB=true
ENV WEB_DIST_PATH=../web/dist

COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/apps/api/dist ./apps/api/dist
COPY --from=api /app/apps/api/package.json ./apps/api/
COPY --from=api /app/apps/api/prisma ./apps/api/prisma
COPY --from=web /app/apps/web/dist ./apps/web/dist

# Usuario sin privilegios: si alguien escapa del proceso, no es root.
RUN addgroup -S eterclack && adduser -S eterclack -G eterclack \
    && chown -R eterclack:eterclack /app
USER eterclack

WORKDIR /app/apps/api
EXPOSE 3000

# `migrate deploy` es idempotente: aplica lo pendiente y sigue. Va aquí y no
# en un paso aparte para que un rollback de imagen no deje la base adelantada
# respecto al código.
#
# El sembrado va detrás porque la pestaña Shell de Render es de pago: en el
# plan gratuito no hay otra forma de poblar la base. Solo actúa si está vacía,
# así que no se repite en cada despertar del servicio.
CMD ["sh", "-c", "npx prisma migrate deploy && { [ \"$SEED_ON_START\" = \"true\" ] && node dist/prisma/sembrar-si-vacia.js; true; } && node dist/src/server.js"]
