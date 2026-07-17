import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthOrchestratorService } from './auth-orchestrator.service';
import { AuthController } from './auth.controller';
import { AuditService } from '../common/audit.service';
import { PhoneService } from '../notifications/phone.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    // ⚠️ Pas de `signOptions.expiresIn` par défaut ici : AuthService calcule et
    // embarque toujours `exp` directement dans le payload signé (durée de
    // session événementielle dynamique, CDC §7.2). JwtService.sign() fusionne
    // TOUJOURS un éventuel signOptions par défaut du module — même quand
    // l'appelant ne passe aucune option — donc un défaut ici entrerait en
    // conflit avec le `exp` du payload (jsonwebtoken rejette la combinaison).
    // Voir RULES.md §13.
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    AuthOrchestratorService,
    AuditService,
    PhoneService,
    WhatsappService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, AuditService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
