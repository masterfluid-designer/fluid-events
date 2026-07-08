# ============ Development Stage ============
FROM node:20-alpine AS development

WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* ./
COPY apps/web apps/web/
COPY packages packages/

RUN pnpm install

EXPOSE 3000

CMD ["pnpm", "run", "dev"]

# ============ Production Stage ============
FROM node:20-alpine AS production

WORKDIR /app

RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml* ./
COPY apps/web apps/web/
COPY packages packages/

RUN pnpm install --frozen-lockfile

RUN cd apps/web && pnpm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["pnpm", "run", "start"]
