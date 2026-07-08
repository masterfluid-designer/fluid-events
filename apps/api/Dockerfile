# ============ Development Stage ============
FROM node:20-alpine AS development

WORKDIR /app

# Installer pnpm (plus rapide que npm)
RUN npm install -g pnpm

# Copier root package.json et lock
COPY package.json pnpm-lock.yaml* ./

# Copier le workspace
COPY apps/api apps/api/
COPY packages packages/

# Installer les dépendances
RUN pnpm install

# Générer Prisma client
RUN cd apps/api && pnpm dlx prisma generate

EXPOSE 4000 9229

CMD ["pnpm", "run", "start:dev"]

# ============ Production Stage ============
FROM node:20-alpine AS production

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
COPY apps/api apps/api/
COPY packages packages/

RUN pnpm install --prod

RUN cd apps/api && pnpm dlx prisma generate && npm run build

EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "apps/api/dist/main.js"]
