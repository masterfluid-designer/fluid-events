import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export const TICKET_PDF_QUEUE = 'ticket-pdf';
export const GENERATE_PDF_JOB = 'generate';

export interface GeneratePdfJobData {
  orderItemId: string;
}

/**
 * PdfQueueService — Point d'entrée pour déclencher la génération PDF
 * asynchrone d'un billet (CDC ADR §3 : Puppeteer hors chemin critique webhook).
 *
 * N'ajoute qu'un job Redis (rapide) — le rendu réel se fait dans `PdfProcessor`.
 */
@Injectable()
export class PdfQueueService {
  private readonly logger = new Logger(PdfQueueService.name);

  constructor(@InjectQueue(TICKET_PDF_QUEUE) private readonly queue: Queue<GeneratePdfJobData>) {}

  async enqueueGeneratePdf(orderItemId: string): Promise<void> {
    await this.queue.add(
      GENERATE_PDF_JOB,
      { orderItemId },
      {
        attempts: Number(process.env.BULLMQ_DEFAULT_ATTEMPTS ?? 3),
        backoff: {
          type: 'exponential',
          delay: Number(process.env.BULLMQ_DEFAULT_BACKOFF_DELAY ?? 5000),
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    this.logger.debug(`Job PDF mis en queue pour OrderItem ${orderItemId}.`);
  }
}
