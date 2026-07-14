import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TicketDesignService } from '../ticket-design/ticket-design.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../common/audit.service';
import { EmailService } from '../notifications/email.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import { PhoneService } from '../notifications/phone.service';
import { TICKET_PDF_QUEUE, GENERATE_PDF_JOB, GeneratePdfJobData } from './pdf-queue.service';

/**
 * PdfProcessor — Worker BullMQ : rendu HTML → PDF (Puppeteer) → upload S3.
 *
 * Hors chemin critique webhook (CDC ADR §3) : le webhook ne fait qu'ajouter
 * le job (`PdfQueueService.enqueueGeneratePdf`), tout le travail lourd
 * (lancement Chromium, rendu, upload) se fait ici, de façon asynchrone.
 */
@Processor(TICKET_PDF_QUEUE)
export class PdfProcessor {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketDesignService: TicketDesignService,
    private readonly storageService: StorageService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsappService,
    private readonly phoneService: PhoneService,
  ) {}

  @Process(GENERATE_PDF_JOB)
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

    await this.maybeSendTicketNotifications(orderItem.order.id);
  }

  /**
   * Envoie les notifications "billets prêts" (email + WhatsApp) une fois que
   * TOUS les OrderItem de la commande ont leur PDF généré (une commande peut
   * contenir plusieurs billets, chacun généré par un job séparé) — jamais une
   * notification par billet, une seule par commande. Best-effort : ne fait
   * jamais échouer le job PDF (EmailService/WhatsappService avalent déjà
   * leurs propres erreurs). WhatsApp est ignoré si le client n'a pas de
   * téléphone valide (email reste le canal garanti, `User.email` requis).
   */
  private async maybeSendTicketNotifications(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
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

    await this.emailService.sendTicketReadyEmail({
      to: order.client.email,
      clientName,
      eventTitle: order.event.title,
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        ticketName: item.ticket.name,
        qrCodeUrl: item.qrCodeUrl as string,
      })),
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
  }

  private async renderPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
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
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: (process.env.PDF_FORMAT as 'A4') || 'A4',
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
