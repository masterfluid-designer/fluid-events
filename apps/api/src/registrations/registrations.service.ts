import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCodes,
  EventAccessMode,
  validerQuestionnaire,
  validerReponses,
  type ChampQuestionnaire,
  type Questionnaire,
} from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { EventAccessService } from '../common/event-access.service';
import { PhoneService } from '../notifications/phone.service';
import { EmailService } from '../notifications/email.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

/** Code Prisma — violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Plafond de la liste d'émargement chargée d'un coup sur le téléphone d'un
 * agent. 2 000 lignes ≈ 250 Ko : tenable en 3G, et très au-delà de ce que
 * le régime « inscription simple » a vocation à accueillir.
 */
const PLAFOND_LISTE_AGENT = 2000;

/**
 * RegistrationsService — inscriptions sans billetterie (lot 2, 2026-08-22).
 *
 * Ni compte, ni commande, ni paiement : l'organisateur veut savoir qui vient.
 * Le formulaire est PUBLIC, ce qui en fait la seule porte ouverte de la
 * plateforme sur une écriture en base — d'où l'unicité par adresse, seul
 * garde-fou qui ne coûte rien à un inscrit de bonne foi.
 *
 * Pas de CAPTCHA : sur l'inscription à une soirée, il arrête moins de robots
 * qu'il ne décourage d'invités.
 */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acces: EventAccessService,
    private readonly phoneService: PhoneService,
    private readonly email: EmailService,
  ) {}

  /**
   * Enregistre un participant. Le régime est relu EN BASE : sans cela, on
   * pourrait remplir la liste d'un événement qui vend des billets.
   */
  async inscrire(eventSlug: string, dto: CreateRegistrationDto) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
      select: {
        id: true,
        accessMode: true,
        status: true,
        title: true,
        startDate: true,
        venueName: true,
        city: true,
        // Le questionnaire est RELU EN BASE, jamais pris du client : sans
        // cela, n'importe qui répondrait à des questions inventées, et le
        // dépouillement d'un sondage compterait des réponses jamais posées.
        registrationForm: { select: { isActive: true, fields: true } },
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }

    if (event.accessMode !== EventAccessMode.RSVP) {
      throw new ForbiddenException({
        code: ErrorCodes.EVENT_NOT_ACTIVE,
        message: "Cet événement ne fonctionne pas sur inscription.",
      });
    }

    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_NOT_ACTIVE,
        message: "L'événement n'est pas ouvert aux inscriptions.",
      });
    }

    const email = dto.email.trim().toLowerCase();

    /*
     * Questionnaire désactivé : on ignore ce qui a pu être envoyé plutôt que
     * de refuser. Entre le moment où un visiteur ouvre la page et celui où il
     * envoie, l'organisateur a pu le couper — perdre ces réponses-là vaut
     * mieux que perdre l'inscription.
     */
    const questionnaireActif = event.registrationForm?.isActive === true;
    const champs = questionnaireActif
      ? ((event.registrationForm!.fields as unknown as ChampQuestionnaire[]) ?? [])
      : [];

    const controle = validerReponses(champs, dto.answers);
    if (!controle.ok) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: controle.erreurs[0]?.message ?? 'Réponses invalides.',
        details: { erreurs: controle.erreurs },
      });
    }

    try {
      const inscription = await this.prisma.registration.create({
        data: {
          eventId: event.id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          // Un numéro illisible ne fait pas échouer l'inscription : il sert à
          // joindre, pas à identifier.
          phone: dto.phone ? this.phoneService.normalizeToE164(dto.phone) : null,
          extraLabel: dto.extraLabel?.trim() || null,
          extraValue: dto.extraValue?.trim() || null,
          // Un questionnaire sans réponse ne laisse pas un tableau vide :
          // `null` distingue « pas de questionnaire » de « questionnaire
          // affiché, tout laissé en blanc ».
          answers:
            controle.reponses.length > 0
              ? (controle.reponses as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
        select: { id: true, firstName: true, createdAt: true },
      });

      await this.audit.log('registration.created', 'Registration', inscription.id, {
        eventId: event.id,
      });

      /*
       * La confirmation part sans bloquer : `sendRegistrationConfirmationEmail`
       * n'échoue jamais vers l'appelant. Une inscription enregistrée ne doit
       * pas paraître refusée parce qu'un serveur d'email a hoqueté — le nom
       * est sur la liste de toute façon.
       */
      await this.email.sendRegistrationConfirmationEmail({
        to: email,
        firstName: inscription.firstName,
        eventTitle: event.title,
        dateLabel: new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(event.startDate),
        placeLabel: [event.venueName, event.city].filter(Boolean).join(', ') || undefined,
      });

      return { id: inscription.id, firstName: inscription.firstName, eventTitle: event.title };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        /*
         * Déjà inscrit. On le DIT, plutôt que de faire semblant d'accepter :
         * contrairement à un formulaire de connexion, il n'y a rien à
         * protéger ici — la liste n'est pas secrète pour qui y figure, et
         * laisser croire à une seconde inscription ferait douter la personne
         * de sa présence sur la liste le soir venu.
         */
        throw new ConflictException({
          code: ErrorCodes.ALREADY_REGISTERED,
          message: 'Cette adresse est déjà inscrite à cet événement.',
        });
      }
      throw err;
    }
  }


  /**
   * Le questionnaire d'un événement, tel que l'organisateur l'a composé
   * (2026-08-27).
   *
   * Rend un questionnaire VIDE plutôt qu'une erreur quand il n'en existe pas
   * encore : l'éditeur s'ouvre alors sur une page blanche, ce qui est
   * exactement l'état des choses.
   */
  async lireQuestionnaire(managerId: string, eventId?: string): Promise<Questionnaire> {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);

    const forme = await this.prisma.registrationForm.findUnique({
      where: { eventId: id },
      select: { isActive: true, title: true, description: true, fields: true },
    });

    return {
      actif: forme?.isActive ?? false,
      titre: forme?.title ?? undefined,
      description: forme?.description ?? undefined,
      champs: ((forme?.fields as unknown as ChampQuestionnaire[]) ?? []),
    };
  }

  /**
   * Enregistre le questionnaire.
   *
   * ⚠️ **Les réponses déjà recueillies ne sont jamais touchées.** Elles
   * portent leur propre libellé et leur propre type : remanier le
   * questionnaire ne réécrit pas le passé, il change ce qu'on demandera
   * ensuite. Un sondage dont les questions changent après coup ne vaut rien.
   */
  async enregistrerQuestionnaire(
    managerId: string,
    questionnaire: Questionnaire,
    eventId?: string,
  ): Promise<Questionnaire> {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);

    const erreurs = validerQuestionnaire(questionnaire);
    if (erreurs.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: erreurs[0],
        details: { erreurs },
      });
    }

    const champs = questionnaire.champs.map((c) => ({
      ...c,
      libelle: c.libelle.trim(),
      aide: c.aide?.trim() || undefined,
      options: c.options?.map((o) => o.trim()).filter(Boolean),
    })) as unknown as Prisma.InputJsonValue;

    const donnees = {
      isActive: questionnaire.actif,
      title: questionnaire.titre?.trim() || null,
      description: questionnaire.description?.trim() || null,
      fields: champs,
    };

    await this.prisma.registrationForm.upsert({
      where: { eventId: id },
      create: { eventId: id, ...donnees },
      update: donnees,
    });

    await this.audit.log(
      'registration.form.updated',
      'RegistrationForm',
      id,
      { actif: questionnaire.actif, questions: questionnaire.champs.length },
      managerId,
    );

    return this.lireQuestionnaire(managerId, id);
  }

  /**
   * Liste des inscrits, pour le tableau de bord de l'organisateur.
   * L'appartenance passe par le contrôle partagé — un manager ne lit jamais
   * la liste d'un événement qui n'est pas le sien.
   */
  async listerPourManager(
    managerId: string,
    eventId?: string,
    options?: { limit?: number; offset?: number; q?: string },
  ) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);

    /*
     * Pagination bornée (2026-08-22). Une soirée à huit cents inscrits
     * chargeait tout d’un coup — sur le téléphone de l’accueil, la veille,
     * en 3G. Le plafond est appliqué ICI et non côté client : une limite
     * qu’on peut demander à 100 000 n’est pas une limite.
     */
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const offset = Math.max(options?.offset ?? 0, 0);

    /*
     * La recherche porte sur la BASE, pas sur la page rendue : chercher
     * « Konaté » dans les cinquante lignes affichées ne le trouverait pas
     * s'il s'est inscrit en trois centième position.
     *
     * Elle emprunte un chemin à part parce qu'elle a besoin d'`unaccent`,
     * qui ne s’exprime pas dans le langage de requête de Prisma. Sans
     * recherche, rien ne change — le cas courant reste du Prisma ordinaire.
     */
    const terme = options?.q?.trim();
    if (terme) return this.rechercher(id, terme, limit, offset);

    const [total, presents, inscriptions] = await Promise.all([
      this.prisma.registration.count({ where: { eventId: id } }),
      this.prisma.registration.count({ where: { eventId: id, checkedInAt: { not: null } } }),
      this.prisma.registration.findMany({
        where: { eventId: id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          extraLabel: true,
          extraValue: true,
          answers: true,
          createdAt: true,
          checkedInAt: true,
        },
      }),
    ]);

    /*
     * `total` compte TOUTE la liste, pas la page rendue : l’organisateur
     * veut savoir combien de monde vient, pas combien de lignes il a sous
     * les yeux. `presents` répond à la question du soir même.
     */
    return { total, presents, items: inscriptions, offset, limit };
  }

  /**
   * Recherche d'inscrits, insensible à la casse ET AUX ACCENTS
   * (2026-08-23).
   *
   * `contains` de Prisma compare octet par octet : « konate » ne trouvait
   * pas « Konaté ». Sur une liste de noms ouest-africains et français,
   * c'est le cas courant, pas le cas limite — et une recherche qui ne
   * trouve pas fait conclure que la personne ne s'est pas inscrite.
   *
   * `unaccent()` est une fonction SQL sans équivalent dans le langage de
   * requête de Prisma : ce chemin passe donc par du SQL brut. Les valeurs
   * restent des paramètres liés — jamais concaténées dans le texte de la
   * requête.
   */
  private async rechercher(eventId: string, terme: string, limit: number, offset: number) {
    /*
     * `%` et `_` sont les jokers de LIKE : un organisateur qui cherche
     * « 100_%_promo » ne demande pas une expression, il tape ce qu’il lit.
     * On les neutralise avec un caractère d’échappement à nous — « ! »
     * plutôt que l’antislash, qui traverserait trois couches de citation
     * (expression régulière, littéral gabarit, chaîne SQL) avant d’arriver
     * à destination.
     */
    const motif = `%${terme.replace(/[!%_]/g, '!$&')}%`;

    /*
     * Les quatre colonnes concaténées en une seule, parce qu'on cherche
     * indifféremment par un nom, une adresse lue sur un écran de téléphone
     * ou les quatre derniers chiffres d’un numéro. Le séparateur empêche
     * un faux positif à cheval sur deux champs.
     */
    const [compte] = await this.prisma.$queryRaw<Array<{ total: number; presents: number }>>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE "checkedInAt" IS NOT NULL)::int AS presents
        FROM "registrations"
       WHERE "eventId" = ${eventId}
         AND unaccent(lower(
               "firstName" || ' ' || "lastName" || ' ' || "email" || ' ' || coalesce("phone", '')
             )) LIKE unaccent(lower(${motif})) ESCAPE '!'
    `;

    const items = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id", "firstName", "lastName", "email", "phone",
             "extraLabel", "extraValue", "createdAt", "checkedInAt"
        FROM "registrations"
       WHERE "eventId" = ${eventId}
         AND unaccent(lower(
               "firstName" || ' ' || "lastName" || ' ' || "email" || ' ' || coalesce("phone", '')
             )) LIKE unaccent(lower(${motif})) ESCAPE '!'
       ORDER BY "createdAt" DESC
       LIMIT ${limit} OFFSET ${offset}
    `;

    /*
     * `total` compte ici les RÉSULTATS, pas la liste entière — le
     * tableau de bord l'annonce comme tel pendant une recherche.
     */
    return {
      total: compte?.total ?? 0,
      presents: compte?.presents ?? 0,
      items,
      offset,
      limit,
    };
  }

  /**
   * La liste d'émargement d'un agent de contrôle (2026-08-23).
   *
   * Renvoyée EN ENTIER, sans pagination et sans recherche serveur — le
   * contraire de la liste du tableau de bord, et à dessein. À la porte, on
   * cherche un nom pendant que quelqu’un attend devant soi : une recherche
   * qui repasse par le réseau à chaque lettre est inutilisable sous une
   * connexion de salle des fêtes. Chargée une fois, filtrée dans le
   * téléphone, elle répond instantanément et survit à une coupure.
   *
   * Le plafond existe quand même : au-delà, il faudra une autre réponse
   * que « tout charger », et mieux vaut le savoir par une erreur que par
   * un téléphone figé un soir de première.
   */
  async listerPourAgent(userId: string) {
    const { eventId, accessMode } = await this.acces.resoudreEvenementDeLAgent(userId);

    if (accessMode !== EventAccessMode.RSVP) {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_ACCESS_MODE_MISMATCH,
        message:
          'Cet événement fonctionne à la billetterie : les entrées se contrôlent au scan.',
      });
    }

    const [total, presents, items] = await Promise.all([
      this.prisma.registration.count({ where: { eventId } }),
      this.prisma.registration.count({ where: { eventId, checkedInAt: { not: null } } }),
      this.prisma.registration.findMany({
        where: { eventId },
        // Par NOM, pas par date d’inscription : on cherche quelqu’un, on
        // ne consulte pas un journal.
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: PLAFOND_LISTE_AGENT,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          extraLabel: true,
          extraValue: true,
          checkedInAt: true,
        },
      }),
    ]);

    return { total, presents, items, tronquee: total > PLAFOND_LISTE_AGENT };
  }

  /**
   * Pointage par un agent de contrôle. Même geste que celui de
   * l'organisateur, mais l'événement vient du compte, jamais de la requête.
   */
  async pointerParAgent(userId: string, registrationId: string, present: boolean) {
    const { eventId } = await this.acces.resoudreEvenementDeLAgent(userId);

    const inscription = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, eventId: true },
    });

    /*
     * Même réponse pour « n'existe pas » et « pas sur votre événement » :
     * une erreur distincte confirmerait à un agent curieux qu'un
     * identifiant donné existe ailleurs sur la plateforme.
     */
    if (!inscription || inscription.eventId !== eventId) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'Inscription introuvable pour cet événement.',
      });
    }

    const misAJour = await this.prisma.registration.update({
      where: { id: registrationId },
      data: { checkedInAt: present ? new Date() : null },
      select: { id: true, checkedInAt: true },
    });

    await this.audit.log('registration.checked_in', 'Registration', registrationId, {
      present,
      par: 'agent',
    }, userId);

    return misAJour;
  }

  /**
   * Pointe ou dépointe un inscrit à l'entrée (2026-08-22).
   *
   * Réversible, parce qu’on se trompe de ligne sur un téléphone, debout,
   * dans le bruit. Un pointage irréversible obligerait à tenir une liste
   * parallèle sur papier — exactement ce qu’on remplace.
   */
  async pointer(managerId: string, registrationId: string, present: boolean) {
    const inscription = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, eventId: true },
    });

    if (!inscription) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'Inscription introuvable.',
      });
    }

    // L’appartenance passe par le contrôle partagé : on ne pointe jamais un
    // inscrit sur l’événement de quelqu’un d’autre.
    await this.acces.resoudreEvenementDuManager(managerId, inscription.eventId);

    const misAJour = await this.prisma.registration.update({
      where: { id: registrationId },
      data: { checkedInAt: present ? new Date() : null },
      select: { id: true, checkedInAt: true },
    });

    await this.audit.log('registration.checked_in', 'Registration', registrationId, {
      present,
    }, managerId);

    return misAJour;
  }

  /**
   * Retire un inscrit de la liste (désistement).
   *
   * Une vraie suppression, pas un drapeau : la personne a demandé à ne plus
   * figurer sur une liste nominative, et la garder « masquée » ne répondrait
   * pas à cette demande.
   */
  async retirer(managerId: string, registrationId: string) {
    const inscription = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, eventId: true, email: true },
    });

    if (!inscription) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'Inscription introuvable.',
      });
    }

    await this.acces.resoudreEvenementDuManager(managerId, inscription.eventId);

    await this.prisma.registration.delete({ where: { id: registrationId } });

    await this.audit.log('registration.removed', 'Registration', registrationId, {
      eventId: inscription.eventId,
    }, managerId);

    return { removed: true };
  }
}
