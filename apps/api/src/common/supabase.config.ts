import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildAllowedImageBase } from '@saas-events/utils';

/**
 * SupabaseConfig — Accès typé aux variables Supabase via ConfigService.
 *
 * Centralise la lecture de SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY pour :
 *  - éviter l'éparpillement des `process.env` dans les services,
 *  - valider la présence des variables au démarrage (fail-fast),
 *  - exposer des helpers métier (allowedImageBase pour la sanitisation d'URL).
 *
 * Référence : CDC §16.1 — variables d'environnement backend.
 */
@Injectable()
export class SupabaseConfig {
  private readonly logger = new Logger(SupabaseConfig.name);
  private readonly url: string | undefined;
  private readonly serviceRoleKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('SUPABASE_URL');
    this.serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
  }

  /** URL publique du projet Supabase (ex: https://xxxx.supabase.co). */
  getUrl(): string {
    if (!this.url) {
      throw new Error(
        'SUPABASE_URL manquant — vérifiez votre .env (CDC §16.1).',
      );
    }
    return this.url;
  }

  /** Service role key — bypass RLS. À n'utiliser QUE côté serveur. */
  getServiceRoleKey(): string {
    if (!this.serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY manquant — vérifiez votre .env (CDC §16.1).',
      );
    }
    return this.serviceRoleKey;
  }

  /**
   * Préfixe du bucket public autorisé pour les images de billet.
   * Calculé via buildAllowedImageBase (@saas-events/utils) pour rester
   * cohérent avec la sanitisation des URLs côté ticket-design.
   */
  getAllowedImageBase(): string {
    return buildAllowedImageBase(this.getUrl());
  }

  /** Indique si la configuration Supabase est complète (utile pour les healthchecks). */
  isConfigured(): boolean {
    return Boolean(this.url && this.serviceRoleKey);
  }
}
