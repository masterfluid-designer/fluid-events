# ============ Development Stage ============
FROM node:20-alpine AS development

WORKDIR /app

RUN npm install -g pnpm@9.15.9

# SANS pnpm-workspace.yaml, pnpm ne reconnaît pas /app comme un workspace et
# n'installe QUE les devDependencies du package.json racine (turbo/typescript),
# en ignorant silencieusement toutes les dépendances de apps/web (bug réel
# rencontré ici — le build de l'image "réussissait" quand même car rien
# pendant le build ne vérifie que `next` est réellement installé).
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/web apps/web/
COPY packages packages/

RUN pnpm install

# @saas-events/types et @saas-events/utils sont résolus via leur dist/ compilé
# (package.json "main"/"types" -> ./dist, pas d'alias tsconfig vers src/) —
# pnpm install ne les build pas automatiquement, il faut le faire explicitement.
RUN npx tsc -p packages/types/tsconfig.build.json && npx tsc -p packages/utils/tsconfig.build.json

EXPOSE 3000

# Même raisonnement que apps/api/Dockerfile : packages/types et packages/utils
# sont résolus via leur dist/ compilé, jamais rebuild automatiquement quand
# leur source change (bind mount) — on les watch en parallèle du dev server.
CMD ["npx", "concurrently", "-k", "-n", "types,utils,web", "-c", "blue,green,yellow", "pnpm --filter @saas-events/types run dev", "pnpm --filter @saas-events/utils run dev", "pnpm --filter @saas-events/web run dev"]

# ============ Production Stage ============
FROM node:20-alpine AS production

WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/web apps/web/
COPY packages packages/

RUN pnpm install --frozen-lockfile

RUN npx tsc -p packages/types/tsconfig.build.json && npx tsc -p packages/utils/tsconfig.build.json

RUN cd apps/web && pnpm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@saas-events/web", "run", "start"]
