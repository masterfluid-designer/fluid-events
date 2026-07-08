import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Point d'entrée du backend NestJS (CDC §3 — apps/api).
 *
 * Sécurité transverse appliquée ici :
 *  - ValidationPipe global : active class-validator sur tous les DTOs
 *  - CORS : autorise uniquement le frontend déclaré (FRONTEND_URL)
 *  - prefix global /api : cohérent avec la structure de routes du CDC §6
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Préfixe global — toutes les routes sont sous /api/* (CDC §6)
  app.setGlobalPrefix('api');

  // Validation globale des DTOs (class-validator + class-transformer)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips unknown properties (anti-mass-assignment)
      forbidNonWhitelisted: true, // 400 si propriétés inconnues
      transform: true, // cast automatique des types (DTOs typés)
    }),
  );

  // CORS — restreint au frontend autorisé
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl,
    credentials: true, // cookies httpOnly (access_token, refresh_token)
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  logger.log(`🚀 API démarrée sur http://localhost:${port}/api`);
  logger.log(`↔️  CORS autorisé pour ${frontendUrl}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Échec du démarrage :', err);
  process.exit(1);
});
