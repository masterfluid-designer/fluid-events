# Setup Instructions

## Prerequisites
- Node.js 20+
- Docker & Docker Compose
- pnpm package manager
- Git

## Quick Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment
```bash
cp .env.example .env
cp .env.example ./apps/api/.env
# Edit both .env files with your local settings (Google OAuth, payment providers, etc.)
```

### 3. Start Docker Services
```bash
docker compose up -d

# Verify services:
# - PostgreSQL: localhost:5432
# - Redis: localhost:6379
# - Mailpit: localhost:8025 (UI)
# - RustFS: localhost:9001 (Console)
```

### 4. Database Setup
```bash
pnpm db:generate    # Generate Prisma client
pnpm db:migrate     # Run migrations
```

Optional: seed test data — not yet wired to a pnpm script, run directly:
```bash
pnpm --filter @saas-events/api exec ts-node prisma/seed.ts
```

### 5. Start Development
```bash
# Terminal 1: All services (watch mode)
pnpm dev

# Or separately:
# Terminal 1: Frontend
cd apps/web && pnpm dev

# Terminal 2: Backend
cd apps/api && pnpm dev
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Mailpit: http://localhost:8025
- RustFS: http://localhost:9001

## Common Commands

```bash
# Development
pnpm dev              # Start all services
pnpm build            # Build all packages
pnpm lint             # Lint (currently apps/web only — apps/api has no lint script)
pnpm test             # Run tests (currently apps/api only — apps/web has no test script)

# Database
pnpm db:migrate       # Create/run migrations
pnpm db:generate      # Regenerate Prisma client
pnpm db:studio        # Open Prisma Studio

# Docker
docker compose up -d   # Start services
docker compose down    # Stop services
docker compose logs -f # View logs
```

`db:seed` and `db:reset` are not defined as pnpm scripts yet. A seed script
exists at `apps/api/prisma/seed.ts` — run it manually with
`pnpm --filter @saas-events/api exec ts-node prisma/seed.ts`.

## Troubleshooting

### PostgreSQL Connection Error
```bash
# Check if postgres container is running
docker compose ps

# Restart
docker compose restart postgres
```

### Port Already in Use
```bash
# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Prisma Client Issues
```bash
# Regenerate
pnpm db:generate

# Clear cache
rm -rf node_modules/.prisma
pnpm install
```

## Project Structure

See README.md for full project structure and documentation.
