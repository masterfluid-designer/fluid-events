import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRATION: z.string().default('7d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // Storage S3
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_ACCESS_KEY: z.string(),
  STORAGE_SECRET_KEY: z.string(),
  STORAGE_BUCKET: z.string(),
  STORAGE_REGION: z.string().default('us-east-1'),

  // SMTP Email
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string().default('1025'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().default('noreply@fluid-events.com'),

  // App URLs
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  API_INTERNAL_URL: z.string().url().optional(),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
