import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCodes, EventAccessMode, Role } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { PhoneService } from '../notifications/phone.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/**
 * GuestCheckoutService — achat sans compte (lot 1, 2026-08-22).
 *
 * `Order.clientId` est obligatoire, et le scan, l'export des participants, la
 * rétention et les remboursements en dépendent tous. Rendre la colonne
 * nullable aurait imposé un `if (client === null)` dans chacun de ces chemins,
 * dont un seul oublié suffit à produire une commande orpheline — ou pire,
 * visible par quelqu'un d'autre.
 *
 * On crée donc un vrai compte, que le visiteur ne voit jamais : pas de mot de
 * passe, pas de connexion, pas de page « Mon billet ». Le billet arrive par
 * email avec un lien signé qui n'ouvre QUE cette commande.
 *
 * Tout le tunnel existant continue de fonctionner sans une ligne de
 * changement : `initPayment` ne lit que `user.id`.
 */
@Injectable()
export class GuestCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly phoneService: PhoneService,
  ) {}

  /**
   * Vérifie que l'événement accepte l'achat sans compte, puis retourne le
   * porteur de la commande.
   *
   * Le régime est relu en base à CHAQUE achat, jamais reçu du client : sans
   * cela, un appel direct à l'API permettrait d'acheter sans compte sur un
   * événement qui l'exige.
   */
  async resoudreAcheteur(params: {
    eventSlug: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<RequestUser> {
    const { eventSlug, email, firstName, lastName, phone } = params;

    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { id: true, accessMode: true, status: true },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }

    if (event.accessMode !== EventAccessMode.TICKETED_GUEST) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_REQUIRED_TO_PURCHASE,
        message: 'Cet événement demande un compte pour acheter.',
      });
    }

    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_NOT_ACTIVE,
        message: "L'événement n'est pas actif.",
      });
    }

    const adresse = email.trim().toLowerCase();
    const nom = `${firstName.trim()} ${lastName.trim()}`.trim();

    /*
     * Un numéro invalide ne fait pas échouer l'achat : il sert à joindre
     * l'acheteur, pas à l'authentifier. Le refuser ferait perdre une vente
     * pour un espace de trop.
     */
    const numero = phone ? this.phoneService.normalizeToE164(phone) : null;

    const existant = await this.prisma.user.findUnique({
      where: { email: adresse },
      select: { id: true, email: true, role: true, isGuest: true, name: true, phone: true },
    });

    if (existant) {
      /*
       * Un compte existe déjà sur cette adresse. On le réutilise plutôt que
       * d'en fabriquer un second : la personne qui se connectera un jour doit
       * retrouver TOUS ses billets, y compris ceux achetés en invité.
       *
       * Un compte MANAGER ou SCANNER, en revanche, n'a rien à faire ici — lui
       * attacher une commande client mélangerait deux rôles dans un même
       * compte, et le dashboard n'a pas de place pour ça.
       */
      if (existant.role !== Role.CLIENT) {
        throw new ForbiddenException({
          code: ErrorCodes.AUTH_REQUIRED_TO_PURCHASE,
          message: 'Cette adresse est associée à un compte organisateur. Connectez-vous pour acheter.',
        });
      }

      // On complète ce qui manque, sans jamais écraser ce que la personne a
      // elle-même renseigné.
      const complements: { name?: string; phone?: string } = {};
      if (!existant.name && nom) complements.name = nom;
      if (!existant.phone && numero) complements.phone = numero;
      if (Object.keys(complements).length > 0) {
        await this.prisma.user.update({ where: { id: existant.id }, data: complements });
      }

      return { id: existant.id, email: existant.email, role: Role.CLIENT };
    }

    const cree = await this.prisma.user.create({
      data: {
        email: adresse,
        name: nom || null,
        phone: numero,
        role: Role.CLIENT,
        isGuest: true,
        // Ni mot de passe ni Google : ce compte ne peut pas se connecter, et
        // c'est voulu. Il n'existe que pour porter la commande.
      },
      select: { id: true, email: true },
    });

    await this.audit.log('checkout.guest.account_created', 'User', cree.id, {
      eventId: event.id,
      email: adresse,
    });

    return { id: cree.id, email: cree.email, role: Role.CLIENT };
  }
}
