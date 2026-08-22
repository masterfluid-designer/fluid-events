import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthOrchestratorService } from './auth-orchestrator.service';
import { AuthController } from './auth.controller';
import { AuditService } from '../common/audit.service';
import { PhoneService } from '../notifications/phone.service';
import { SmsService } from '../notifications/sms.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoService } from '../common/crypto.service';

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
    // Le code de vérification part par SMS depuis le 2026-08-21 : WhatsApp
    // exigeait un template approuvé par Meta, jamais obtenu, et le canal
    // restait donc muet. SmsService n’a besoin que de trois variables
    // Twilio.
    SmsService,
    // CryptoService reste : d’autres réglages lus en base y sont chiffrés,
    // et sans lui l'application ne démarre pas.
    CryptoService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  controllers: [AuthController],
  /*
   * JwtModule est réexporté (2026-08-22) pour que les liens de billet
   * signés soient produits et vérifiés avec LE MÊME secret que les
   * sessions. Redéclarer un JwtModule ailleurs marcherait aussi — jusqu'au
   * jour où les deux configurations divergent, et où les liens déjà envoyés
   * cessent silencieusement de fonctionner.
   */
  exports: [AuthService, AuditService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
