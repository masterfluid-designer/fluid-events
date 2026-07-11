/**
 * Tests unitaires — ScannerService.validateScan()
 * Couvre l'orchestration Prisma autour de decideScan() (CDC §9.5, RULES §2/§4) :
 * verrou atomique anti double-scan, y compris le cas de course perdue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScannerService } from './scanner.service';
import { ScanResult } from '@saas-events/types';

const VALID_PAYLOAD = { oid: 'oi-1', eid: 'evt-1', tid: 'tk-1' };

describe('ScannerService — validateScan()', () => {
  let verifyQrToken: ReturnType<typeof vi.fn>;
  let findUniqueScanner: ReturnType<typeof vi.fn>;
  let findUniqueEvent: ReturnType<typeof vi.fn>;
  let findUniqueOrderItem: ReturnType<typeof vi.fn>;
  let updateManyOrderItem: ReturnType<typeof vi.fn>;
  let createScannerLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    verifyQrToken = vi.fn();
    findUniqueScanner = vi.fn();
    findUniqueEvent = vi.fn();
    findUniqueOrderItem = vi.fn();
    updateManyOrderItem = vi.fn();
    createScannerLog = vi.fn().mockResolvedValue({ id: 'log-1' });
  });

  function makeService() {
    const prisma = {
      scanner: { findUnique: findUniqueScanner },
      event: { findUnique: findUniqueEvent },
      orderItem: { findUnique: findUniqueOrderItem, updateMany: updateManyOrderItem },
      scannerLog: { create: createScannerLog },
    } as any;
    const ticketDesign = { verifyQrToken } as any;
    return new ScannerService(prisma, ticketDesign);
  }

  const activeScanner = { id: 'scn-1', isActive: true, eventId: 'evt-1' };
  const publishedEvent = { id: 'evt-1', status: 'PUBLISHED' };
  const unscannedOrderItem = {
    id: 'oi-1',
    isScanned: false,
    order: { status: 'PAID', client: { name: 'Aïcha Koné' } },
    ticket: { name: 'VIP Or' },
  };

  it('scan valide : marque scanné atomiquement et retourne VALID + attendee', async () => {
    verifyQrToken.mockReturnValue({ valid: true, payload: VALID_PAYLOAD });
    findUniqueScanner.mockResolvedValue(activeScanner);
    findUniqueEvent.mockResolvedValue(publishedEvent);
    findUniqueOrderItem.mockResolvedValue(unscannedOrderItem);
    updateManyOrderItem.mockResolvedValue({ count: 1 });

    const service = makeService();
    const result = await service.validateScan('user-1', 'token', { ip: '1.2.3.4' });

    expect(result.result).toBe(ScanResult.VALID);
    expect(result.attendee).toMatchObject({ name: 'Aïcha Koné', ticketName: 'VIP Or' });
    expect(result.attendee?.scannedAt).toBeDefined();
    expect(updateManyOrderItem).toHaveBeenCalledWith({
      where: { id: 'oi-1', isScanned: false },
      data: expect.objectContaining({ isScanned: true, scannedById: 'scn-1' }),
    });
    expect(createScannerLog).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: ScanResult.VALID }) }),
    );
  });

  it('billet déjà scanné en base : retourne ALREADY_USED sans tenter d\'écriture', async () => {
    verifyQrToken.mockReturnValue({ valid: true, payload: VALID_PAYLOAD });
    findUniqueScanner.mockResolvedValue(activeScanner);
    findUniqueEvent.mockResolvedValue(publishedEvent);
    findUniqueOrderItem.mockResolvedValue({ ...unscannedOrderItem, isScanned: true });

    const service = makeService();
    const result = await service.validateScan('user-1', 'token', {});

    expect(result.result).toBe(ScanResult.ALREADY_USED);
    expect(updateManyOrderItem).not.toHaveBeenCalled();
  });

  it('course concurrente perdue (updateMany count=0) : retombe sur ALREADY_USED', async () => {
    verifyQrToken.mockReturnValue({ valid: true, payload: VALID_PAYLOAD });
    findUniqueScanner.mockResolvedValue(activeScanner);
    findUniqueEvent.mockResolvedValue(publishedEvent);
    findUniqueOrderItem.mockResolvedValue(unscannedOrderItem);
    updateManyOrderItem.mockResolvedValue({ count: 0 }); // un autre scan a gagné la course

    const service = makeService();
    const result = await service.validateScan('user-1', 'token', {});

    expect(result.result).toBe(ScanResult.ALREADY_USED);
    expect(result.attendee).toBeUndefined();
  });

  it('QR invalide : ne fait aucune requête event/orderItem', async () => {
    verifyQrToken.mockReturnValue({ valid: false, reason: ScanResult.INVALID });
    findUniqueScanner.mockResolvedValue(activeScanner);

    const service = makeService();
    const result = await service.validateScan('user-1', 'token', {});

    expect(result.result).toBe(ScanResult.INVALID);
    expect(findUniqueEvent).not.toHaveBeenCalled();
    expect(findUniqueOrderItem).not.toHaveBeenCalled();
  });

  it('scanner introuvable (désactivé/supprimé) : ne log rien en base', async () => {
    verifyQrToken.mockReturnValue({ valid: true, payload: VALID_PAYLOAD });
    findUniqueScanner.mockResolvedValue(null);
    findUniqueEvent.mockResolvedValue(publishedEvent);
    findUniqueOrderItem.mockResolvedValue(unscannedOrderItem);

    const service = makeService();
    const result = await service.validateScan('user-1', 'token', {});

    expect(result.result).toBe(ScanResult.INVALID);
    expect(createScannerLog).not.toHaveBeenCalled();
  });

  it('ne remonte jamais email/phone dans la réponse (minimisation CDC §2.2)', async () => {
    verifyQrToken.mockReturnValue({ valid: true, payload: VALID_PAYLOAD });
    findUniqueScanner.mockResolvedValue(activeScanner);
    findUniqueEvent.mockResolvedValue(publishedEvent);
    findUniqueOrderItem.mockResolvedValue(unscannedOrderItem);
    updateManyOrderItem.mockResolvedValue({ count: 1 });

    const service = makeService();
    const result = await service.validateScan('user-1', 'token', {});

    expect(result.attendee).toEqual(
      expect.not.objectContaining({ email: expect.anything(), phone: expect.anything() }),
    );
    // Vérifie aussi que la requête Prisma elle-même ne sélectionne pas email/phone
    expect(findUniqueOrderItem).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          order: { select: { status: true, client: { select: { name: true } } } },
        }),
      }),
    );
  });
});
