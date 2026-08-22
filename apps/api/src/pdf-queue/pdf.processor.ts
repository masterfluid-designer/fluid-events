import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import puppeteer, { type Browser } from 'puppeteer';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TicketDesignService } from '../ticket-design/ticket-design.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../common/audit.service';
import { EmailService } from '../notifications/email.service';
import { WhatsappService } from '../notifications/whatsapp.service';

import { PhoneService } from '../notifications/phone.service';
import { TICKET_PDF_QUEUE, GENERATE_PDF_JOB, GeneratePdfJobData } from './pdf-queue.service';
import { TicketAccessService } from '../payments/ticket-access.service';

/** Adresse publique de l’application — le lien du billet y renvoie. */
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

/**
 * PdfProcessor — Worker BullMQ : rendu HTML → PDF (Puppeteer) → upload S3.
 *
 * Hors chemin critique webhook (CDC ADR §3) : le webhook ne fait qu'ajouter
 * le job (`PdfQueueService.enqueueGeneratePdf`), tout le travail lourd
 * (lancement Chromium, rendu, upload) se fait ici, de façon asynchrone.
 */
/**
 * Délai d'inactivité avant de refermer le navigateur partagé. Les billets
 * arrivent par salves — après un achat, la salve est finie en quelques
 * secondes, et rien ne justifie de garder Chromium en mémoire.
 */
const INACTIVITE_AVANT_FERMETURE_MS = 2 * 60 * 1000;

@Processor(TICKET_PDF_QUEUE)
export class PdfProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketDesignService: TicketDesignService,
    private readonly storageService: StorageService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsappService,
    private readonly phoneService: PhoneService,
    private readonly ticketAccess: TicketAccessService,
  ) {}

  /*
   * Trois billets de front (2026-08-22). La file n'en traitait qu'un, ce qui
   * sérialisait une commande de dix places. Trois est un compromis assumé :
   * le VPS a un cœur, et chaque page ouverte coûte de la mémoire — au-delà,
   * on échangerait de la latence contre du gonflement.
   */
  @Process({ name: GENERATE_PDF_JOB, concurrency: 3 })
  async handleGenerate(job: Job<GeneratePdfJobData>): Promise<void> {
    const { orderItemId } = job.data;

    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: {
        id: true,
        qrCode: true,
        ticket: { select: { name: true, designImageUrl: true, designBgColor: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            event: { select: { title: true } },
            client: { select: { name: true, phone: true } },
          },
        },
      },
    });

    if (!orderItem || !orderItem.qrCode) {
      this.logger.warn(`Job PDF ${orderItemId} — OrderItem ou QR manquant, abandon.`);
      return;
    }

    try {
      const qrCodeBase64 = await QRCode.toDataURL(orderItem.qrCode);

      const html = this.ticketDesignService.buildHtml({
        designImageUrl: orderItem.ticket.designImageUrl,
        designBgColor: orderItem.ticket.designBgColor,
        eventName: orderItem.order.event.title,
        ticketType: orderItem.ticket.name,
        qrCodeBase64,
        orderNumber: orderItem.order.orderNumber,
        clientName: orderItem.order.client.name ?? 'Client',
        clientPhone: orderItem.order.client.phone ?? '',
      });

      const pdfBuffer = await this.renderPdf(html);
      const url = await this.storageService.uploadBuffer(
        `tickets/${orderItem.id}.pdf`,
        pdfBuffer,
        'application/pdf',
      );

      await this.prisma.orderItem.update({
        where: { id: orderItem.id },
        data: { qrCodeUrl: url },
      });

      await this.audit.log('ticket.pdf.generated', 'OrderItem', orderItem.id, { url });
      this.logger.log(`PDF généré pour OrderItem ${orderItem.id} → ${url}`);
    } catch (err) {
      // Remonté à BullMQ (retry/observabilité de la queue, voir ADR §3) —
      // seul l'audit log est ajouté ici, jamais avalé silencieusement.
      await this.audit.log('ticket.pdf.failed', 'OrderItem', orderItem.id, {
        error: (err as Error).message,
      });
      throw err;
    }

    await this.maybeSendTicketNotifications(orderItem.order.id);
  }

  /**
   * Envoie les notifications "billets prêts" (email + WhatsApp + SMS) une
   * fois que TOUS les OrderItem de la commande ont leur PDF généré (une
   * commande peut contenir plusieurs billets, chacun généré par un job
   * séparé) — jamais une notification par billet, une seule par commande.
   * Best-effort : ne fait jamais échouer le job PDF (chaque *Service avale
   * déjà ses propres erreurs). WhatsApp/SMS ignorés si le client n'a pas de
   * téléphone valide (email reste le canal garanti, `User.email` requis).
   *
   * SMS envoyé en parallèle de WhatsApp, pas en repli conditionné à son
   * échec (le Cloud API Meta ne renvoie le statut de livraison que de façon
   * asynchrone via webhook, non implémenté) — simplification assumée pour
   * la V1, voir ROADMAP.md.
   */
  private async maybeSendTicketNotifications(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        // L’identifiant sert à fabriquer le lien signé du billet.
        id: true,
        orderNumber: true,
        event: { select: { title: true } },
        client: { select: { name: true, email: true, phone: true } },
        items: { select: { qrCodeUrl: true, ticket: { select: { name: true } } } },
      },
    });
    if (!order) return;

    const allReady = order.items.every((item) => item.qrCodeUrl);
    if (!allReady) return;

    const clientName = order.client.name ?? 'Client';

    /*
     * Le lien est produit pour TOUTE commande, pas seulement pour un achat
     * sans compte : un client qui en a un profite aussi d’un accès direct
     * depuis son email, sans passer par une connexion. C'est le même lien,
     * et il n’ouvre que cette commande.
     */
    let ticketUrl: string | undefined;
    try {
      const jeton = await this.ticketAccess.creerJeton(order.id);
      ticketUrl = `${APP_URL}/t/${jeton}`;
    } catch (err) {
      // Un lien manquant ne doit pas retenir l'email : les PDF y sont
      // toujours joints, et le billet reste téléchargeable.
      this.logger.warn(
        `Lien de billet non produit pour la commande ${order.orderNumber} : ${(err as Error).message}`,
      );
    }

    await this.emailService.sendTicketReadyEmail({
      to: order.client.email,
      clientName,
      eventTitle: order.event.title,
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        ticketName: item.ticket.name,
        qrCodeUrl: item.qrCodeUrl as string,
      })),
      ticketUrl,
    });

    const whatsappTo = this.phoneService.normalizeForWhatsapp(order.client.phone);
    if (whatsappTo) {
      await this.whatsappService.sendTicketReadyMessage({
        to: whatsappTo,
        clientName,
        eventTitle: order.event.title,
        orderNumber: order.orderNumber,
      });
    }

    // Le troisième canal (SMS Twilio) a été retiré le 2026-08-22 : son prix à
    // l'unité vers le Togo et le Bénin ne se justifiait pas pour doubler un
    // email et un message WhatsApp qui portent déjà le billet.
  }

  /**
   * Navigateur PARTAGÉ entre les billets (2026-08-22).
   *
   * Il était lancé à chaque billet : une commande de cinq places démarrait
   * cinq fois Chromium, en série, sur un VPS à un cœur. Le lancement coûte
   * plus cher que le rendu lui-même — le réutiliser transforme des secondes
   * en centaines de millisecondes.
   *
   * Il se referme après un temps d’inactivité : un Chromium laissé ouvert
   * indéfiniment finit par peser sur une machine qui n’a pas de marge, et
   * les billets arrivent par salves, pas en continu.
   */
  private navigateur: Browser | null = null;
  private minuterieFermeture: NodeJS.Timeout | null = null;

  private async obtenirNavigateur(): Promise<Browser> {
    // `connected` : un navigateur peut mourir seul (OOM, crash de la page).
    // Le réutiliser aveuglément ferait échouer tous les billets suivants.
    if (this.navigateur?.connected) return this.navigateur;

    this.navigateur = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
      ],
    });

    this.logger.log('Navigateur de rendu démarré (partagé entre les billets).');
    return this.navigateur;
  }

  private programmerFermeture(): void {
    if (this.minuterieFermeture) clearTimeout(this.minuterieFermeture);
    this.minuterieFermeture = setTimeout(() => {
      void this.fermerNavigateur();
    }, INACTIVITE_AVANT_FERMETURE_MS);
    // `unref` : cette minuterie ne doit pas retenir le process à l'arrêt.
    this.minuterieFermeture.unref?.();
  }

  private async fermerNavigateur(): Promise<void> {
    const navigateur = this.navigateur;
    this.navigateur = null;
    if (!navigateur) return;
    try {
      await navigateur.close();
      this.logger.log('Navigateur de rendu fermé après inactivité.');
    } catch (err) {
      this.logger.warn(`Fermeture du navigateur : ${(err as Error).message}`);
    }
  }

  /** À l’arrêt du module : ne pas laisser un Chromium orphelin. */
  async onModuleDestroy(): Promise<void> {
    if (this.minuterieFermeture) clearTimeout(this.minuterieFermeture);
    await this.fermerNavigateur();
  }

  private async renderPdf(html: string): Promise<Buffer> {
    const navigateur = await this.obtenirNavigateur();
    const page = await navigateur.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: (process.env.PDF_FORMAT as 'A4') || 'A4',
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      // La PAGE se ferme, pas le navigateur : c’est tout le gain.
      await page.close().catch(() => undefined);
      this.programmerFermeture();
    }
  }
}
