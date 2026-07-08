import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — wrapper injectable du PrismaClient.
 *
 * Implémente le cycle de vie NestJS (OnModuleInit / OnModuleDestroy) pour gérer
 * proprement les connexions. Toute la sécurité applicative (RLS désactivée —
 * CDC §2.3) transite par ce service côté backend NestJS.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('✅ Connexion PostgreSQL établie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('🔌 Connexion PostgreSQL fermée');
  }
}
