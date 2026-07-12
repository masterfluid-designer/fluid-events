/**
 * Tests unitaires — ScannerService
 * Orchestration BDD de la validation de scan (CDC §9.5) : chargement du
 * contexte, délégation à `decideScan`, et surtout le verrou anti-double-scan
 * via `updateMany` gardé (même idiome que StockService — CDC §8.3/RULES §2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScannerService } from './scanner.service';
import { ScanResult, Role } from '@saas-events/types';

const EVENT_END = new Date(Date.now() + 3600_000);

function makeOrderItemRow() {
  return {
    id: 'oi-1',
    isScanned: false,
    order: { status: 'PAID', client: { name: 'Jean Dupont' } },
    ticket: { name: 'VIP' },
  };
}

/**
 * Fake Prisma minimal, avec un `orderItem.updateMany` gardé qui reproduit
 * fidèlement l'atomicité "ligne" de PostgreSQL : deux appels concurrents sur
 * le même id ne peuvent pas tous les deux réussir si le WHERE isScanned:false
 * n'est plus satisfait après le premier.
 */
function makeFakePrisma(opts: {
  scanner?: { id: string; isActive: boolean; eventId: string } | null;
  event?: { id: string; status: string } | null;
  orderItemRow?: ReturnType<typeof makeOrderItemRow> | null;
}) {
  const state = {
    orderItem: opts.orderItemRow ? { ...opts.orderItemRow } : null,
  };

  return {
    state,
    scanner: {
      findUnique: vi.fn().mockResolvedValue(opts.scanner ?? null),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue(opts.event ?? null),
    },
    orderItem: {
      findUnique: vi.fn().mockImplementation(() =>
        Promise.resolve(state.orderItem ? { ...state.orderItem } : null),
      ),
      updateMany: vi.fn().mockImplementation((args: any) => {
        if (!state.orderItem || state.orderItem.id !== args.where.id) {
          return Promise.resolve({ count: 0 });
        }
        if (args.where.isScanned !== false || state.orderItem.isScanned) {
          return Promise.resolve({ count: 0 });
        }
        state.orderItem.isScanned = true;
        return Promise.resolve({ count: 1 });
      }),
    },
    scannerLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeTicketDesignService(qr: { valid: boolean; payload?: any; reason?: ScanResult }) {
  return { verifyQrToken: vi.fn().mockReturnValue(qr) } as any;
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) } as any;
}

const REQUEST_USER = { id: 'user-1', email: 'scanner@x.com', role: Role.SCANNER, eventId: 'ev-1' };

const VALID_QR = {
  valid: true,
  payload: { oid: 'oi-1', eid: 'ev-1', tid: 'tk-1', iat: 1, exp: 9999999999 },
};

describe('ScannerService.validateScan()', () => {
  let prisma: ReturnType<typeof makeFakePrisma>;

  it('cas nominal : marque scanné et retourne VALID + attendee { name, ticketName }', async () => {
    prisma = makeFakePrisma({
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' },
      event: { id: 'ev-1', status: 'PUBLISHED' },
      orderItemRow: makeOrderItemRow(),
    });
    const service = new ScannerService(prisma as any, makeTicketDesignService(VALID_QR), makeAudit());

    const result = await service.validateScan(REQUEST_USER as any, 'token');

    expect(result.result).toBe(ScanResult.VALID);
    expect(result.attendee?.name).toBe('Jean Dupont');
    expect(result.attendee?.ticketName).toBe('VIP');
    expect(prisma.state.orderItem?.isScanned).toBe(true);
    expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'oi-1', isScanned: false },
      data: expect.objectContaining({ isScanned: true, scannedById: 'sc-1' }),
    });
  });

  it('anti double-scan : un seul des deux scans concurrents obtient VALID, l\'autre ALREADY_USED', async () => {
    prisma = makeFakePrisma({
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' },
      event: { id: 'ev-1', status: 'PUBLISHED' },
      orderItemRow: makeOrderItemRow(),
    });
    const service = new ScannerService(prisma as any, makeTicketDesignService(VALID_QR), makeAudit());

    const [first, second] = await Promise.all([
      service.validateScan(REQUEST_USER as any, 'token'),
      service.validateScan(REQUEST_USER as any, 'token'),
    ]);

    const results = [first.result, second.result].sort();
    expect(results).toEqual([ScanResult.ALREADY_USED, ScanResult.VALID]);
  });

  it('scanner introuvable → INVALID, aucun ScannerLog écrit', async () => {
    prisma = makeFakePrisma({ scanner: null, event: null, orderItemRow: makeOrderItemRow() });
    const service = new ScannerService(prisma as any, makeTicketDesignService(VALID_QR), makeAudit());

    const result = await service.validateScan(REQUEST_USER as any, 'token');

    expect(result.result).toBe(ScanResult.INVALID);
    expect(prisma.scannerLog.create).not.toHaveBeenCalled();
  });

  it('QR déjà scanné en base → ALREADY_USED sans appeler updateMany en double compte', async () => {
    const row = makeOrderItemRow();
    row.isScanned = true;
    prisma = makeFakePrisma({
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' },
      event: { id: 'ev-1', status: 'PUBLISHED' },
      orderItemRow: row,
    });
    const service = new ScannerService(prisma as any, makeTicketDesignService(VALID_QR), makeAudit());

    const result = await service.validateScan(REQUEST_USER as any, 'token');

    expect(result.result).toBe(ScanResult.ALREADY_USED);
    expect(prisma.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('event mismatch → EVENT_MISMATCH, log rattaché au scanner', async () => {
    prisma = makeFakePrisma({
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' },
      event: { id: 'ev-1', status: 'PUBLISHED' },
      orderItemRow: makeOrderItemRow(),
    });
    const mismatchQr = {
      valid: true,
      payload: { oid: 'oi-1', eid: 'OTHER-EVENT', tid: 'tk-1', iat: 1, exp: 9999999999 },
    };
    const service = new ScannerService(prisma as any, makeTicketDesignService(mismatchQr), makeAudit());

    const result = await service.validateScan(REQUEST_USER as any, 'token');

    expect(result.result).toBe(ScanResult.EVENT_MISMATCH);
    expect(prisma.scannerLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scannerId: 'sc-1', result: ScanResult.EVENT_MISMATCH }),
    });
  });

  it('QR expiré → EXPIRED, aucune requête orderItem/event superflue', async () => {
    prisma = makeFakePrisma({ scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } });
    const expiredQr = { valid: false, reason: ScanResult.EXPIRED };
    const service = new ScannerService(prisma as any, makeTicketDesignService(expiredQr as any), makeAudit());

    const result = await service.validateScan(REQUEST_USER as any, 'token');

    expect(result.result).toBe(ScanResult.EXPIRED);
    expect(prisma.orderItem.findUnique).not.toHaveBeenCalled();
  });

  it('la réponse VALID ne contient jamais email/phone du client', async () => {
    prisma = makeFakePrisma({
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' },
      event: { id: 'ev-1', status: 'PUBLISHED' },
      orderItemRow: makeOrderItemRow(),
    });
    const service = new ScannerService(prisma as any, makeTicketDesignService(VALID_QR), makeAudit());

    const result = await service.validateScan(REQUEST_USER as any, 'token');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('phone');
  });
});
