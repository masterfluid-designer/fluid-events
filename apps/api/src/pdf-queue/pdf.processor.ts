import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TicketDesignService } from '../ticket-design/ticket-design.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../common/audit.service';
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
