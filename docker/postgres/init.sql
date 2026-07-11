-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- JSONB support is built into PostgreSQL — no extension needed.

-- Schema (tables, enums) is owned entirely by Prisma migrations.
