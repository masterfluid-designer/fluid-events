# ============ Development Stage ============
FROM node:20-alpine AS development

WORKDIR /app

# node:20-alpine n'a pas openssl (Node embarque sa propre copie statique pour
# son propre module crypto, mais pas la lib partagée système) — sans elle,
# le moteur de requêtes Prisma (Rust, lié dynamiquement à libssl) ne peut ni
# être correctement détecté au `generate`, ni chargé au runtime (bug réel
# rencontré : Prisma devine "openssl-1.1.x" par défaut et tente de charger
# un moteur qui n'a jamais été généré, malgré binaryTargets dans schema.prisma).
RUN apk add --no-cache openssl

# Installer pnpm
RUN npm install -g pnpm@9.15.9

# Copier root package.json, lock et pnpm-workspace.yaml — SANS ce dernier,
# pnpm ne reconnaît pas /app comme un workspace et n'installe QUE les
# devDependencies du package.json racine (turbo/typescript), en ignorant
# silencieusement toutes les dépendances de apps/api (bug réel rencontré ici).
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

# Copier le workspace
COPY apps/api apps/api/
COPY packages packages/

# Installer les dépendances
RUN pnpm install

# @saas-events/types et @saas-events/utils sont résolus via leur dist/ compilé
# (package.json "main"/"types" -> ./dist, pas d'alias tsconfig vers src/) —
# pnpm install ne les build pas automatiquement, il faut le faire explicitement.
RUN npx tsc -p packages/types/tsconfig.build.json && npx tsc -p packages/utils/tsconfig.build.json

# Générer Prisma client (npx, pas "pnpm exec" — la résolution de binaire par
# package dans ce contexte pnpm+Docker ne trouve pas systématiquement les
# bin liés localement, npx remonte l'arborescence node_modules de façon fiable)
RUN cd apps/api && npx prisma generate

EXPOSE 4000 9229

CMD ["pnpm", "--filter", "@saas-events/api", "run", "dev"]

# ============ Production Stage ============
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/api apps/api/
COPY packages packages/

RUN pnpm install --frozen-lockfile --prod=false

RUN npx tsc -p packages/types/tsconfig.build.json && npx tsc -p packages/utils/tsconfig.build.json

RUN cd apps/api && npx prisma generate && pnpm run build

# Remove development dependencies for production
RUN pnpm prune --prod

EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "apps/api/dist/main.js"]
