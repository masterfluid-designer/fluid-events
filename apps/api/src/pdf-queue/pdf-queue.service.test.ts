/**
 * Tests unitaires — PdfQueueService
 * Ajout du job de génération PDF (CDC ADR §3 — hors chemin critique webhook).
 */
import { describe, it, expect, vi } from 'vitest';
import { PdfQueueService, GENERATE_PDF_JOB } from './pdf-queue.service';

describe('PdfQueueService.enqueueGeneratePdf()', () => {
  it('ajoute un job avec retry exponentiel et removeOnComplete', async () => {
    const addMock = vi.fn().mockResolvedValue({});
    const queue = { add: addMock } as any;
    const service = new PdfQueueService(queue);

    await service.enqueueGeneratePdf('oi-1');

    expect(addMock).toHaveBeenCalledWith(
      GENERATE_PDF_JOB,
      { orderItemId: 'oi-1' },
      expect.objectContaining({
        attempts: expect.any(Number),
        backoff: expect.objectContaining({ type: 'exponential' }),
        removeOnComplete: true,
        removeOnFail: false,
      }),
    );
  });
});
