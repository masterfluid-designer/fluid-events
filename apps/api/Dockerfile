# ============ Development Stage ============
FROM node:20-alpine AS development

WORKDIR /app

# Installer pnpm
RUN npm install -g pnpm@9.15.9

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

CMD ["pnpm", "--filter", "@saas-events/api", "run", "dev"]

# ============ Production Stage ============
FROM node:20-alpine AS production

WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* ./
COPY apps/api apps/api/
COPY packages packages/

RUN pnpm install --frozen-lockfile --prod=false

RUN cd apps/api && pnpm dlx prisma generate && pnpm run build

# Remove development dependencies for production
RUN pnpm prune --prod

EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "apps/api/dist/main.js"]
