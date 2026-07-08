-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable JSON/JSONB support
CREATE EXTENSION IF NOT EXISTS json_schema_validation;

-- Create custom types
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'MANAGER', 'CLIENT', 'SCANNER');
CREATE TYPE event_status AS ENUM ('DRAFT', 'PUBLISHED', 'ONGOING', 'ENDED', 'ARCHIVED');
CREATE TYPE ticket_status AS ENUM ('PENDING', 'CONFIRMED', 'SCANNED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');
CREATE TYPE payment_method AS ENUM ('KKIAPAY', 'CINETPAY', 'FEDAPAY');

-- Create initial schema (detailed in Prisma schema.prisma)
-- Prisma migrations will handle the rest
