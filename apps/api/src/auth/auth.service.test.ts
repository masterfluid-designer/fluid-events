/**
 * Tests unitaires — AuthService
 * Session JWT événementielle dynamique (CDC §7.2).
 *
 * Propriétés critiques testées :
 *  - Sans eventSlug → JWT fallback (JWT_EXPIRES_IN)
 *  - Avec eventSlug + event PUBLISHED → exp = event.endDate + 24h (grâce)
 *  - Minimum 1h (garde-fou)
 *  - Refresh token a la même durée que l'access token
 *  - Événement non publié / non trouvé → fallback
 *  - sessionExpiresAt lisible côté frontend (timestamp Unix)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@saas-events/types';
import { parseDurationToSeconds } from '@saas-events/utils';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Fixe le temps pour des assertions déterministes sur les timestamps JWT.
const FIXED_NOW = new Date('2026-06-01T12:00:00Z').getTime();
vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);

function makePrismaMock(event?: { endDate: Date; status: string } | null) {
  return {
    event: {
      findUnique: vi.fn(async () =>
        event
          ? { endDate: event.endDate, status: event.status }
          : null,
      ),
    },
    // autres modèles non utilisés ici
  } as unknown as PrismaService;
}

function makeJwtMock() {
  // Capture les payloads + options passés à sign()
  const calls: Array<{ payload: any; options: any }> = [];
  const jwt = {
    sign: vi.fn((payload: any, options: any = {}) => {
      calls.push({ payload, options });
      // Retourne un token factice encodant l'exp pour décodage facile
      return `signed.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    }),
  } as unknown as JwtService;
  return { jwt, calls };
}

describe('AuthService — generateClientToken()', () => {
  const user = {
    id: 'user-1',
    email: 'client@example.com',
    name: 'Jean Dupont',
    role: Role.CLIENT,
  };

  let prisma: PrismaService;
  let jwt: JwtService;
  let calls: Array<{ payload: any; options: any }>;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    ({ jwt, calls } = makeJwtMock());
    service = new AuthService(prisma, jwt);
  });

  it('sans eventSlug : utilise le fallback JWT_EXPIRES_IN (7d)', async () => {
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-32-chars-min-xxxxxxx';
    process.env.JWT_SECRET = 'access-secret-32-chars-min-xxxxxxxx';

    const result = await service.generateClientToken(user as any);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    // Access token : exp calculé dans le payload (pas d'option expiresIn — cf.
    // note ci-dessus, jsonwebtoken rejette la combinaison des deux).
    expect(calls[0].options.expiresIn).toBeUndefined();
    const nowUnix = Math.floor(FIXED_NOW / 1000);
    expect(calls[0].payload.exp).toBe(nowUnix + parseDurationToSeconds('7d'));
    expect(calls[0].payload.role).toBe(Role.CLIENT);
    expect(calls[0].payload.sub).toBe('user-1');
    // sessionExpiresAt absent en mode fallback
    expect(calls[0].payload.sessionExpiresAt).toBeUndefined();
  });

  it('avec eventSlug + event PUBLISHED : exp = endDate + 24h', async () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    prisma = makePrismaMock({ endDate, status: 'PUBLISHED' });
    ({ jwt, calls } = makeJwtMock());
    service = new AuthService(prisma, jwt);

    await service.generateClientToken(user as any, 'concert-2026');

    const expectedExpUnix = Math.floor(endDate.getTime() / 1000) + 86400; // +24h

    // Access token : exp = endDate + 24h (calculé directement dans le payload)
    expect(calls[0].payload.exp).toBe(expectedExpUnix);
    // sessionExpiresAt présent = endDate + 24h en Unix
    expect(calls[0].payload.sessionExpiresAt).toBe(expectedExpUnix);
  });

  it('applique un minimum de 1h même si l\'événement est très proche', async () => {
    // Événement qui se termine dans 10 minutes → 10min + 24h < 1h ? non, mais testons
    // un événement déjà passé pour vérifier le garde-fou min 1h
    const pastEndDate = new Date(FIXED_NOW - 2 * 3600 * 1000); // passé de 2h
    prisma = makePrismaMock({ endDate: pastEndDate, status: 'PUBLISHED' });
    ({ jwt, calls } = makeJwtMock());
    service = new AuthService(prisma, jwt);

    await service.generateClientToken(user as any, 'past-event');

    // exp doit être au minimum now + 3600s (1h)
    const nowUnix = Math.floor(FIXED_NOW / 1000);
    expect(calls[0].payload.exp - nowUnix).toBeGreaterThanOrEqual(3600);
  });

  it('événement non PUBLISHED (DRAFT) : utilise le fallback', async () => {
    prisma = makePrismaMock({
      endDate: new Date('2026-12-31T23:59:59Z'),
      status: 'DRAFT',
    });
    ({ jwt, calls } = makeJwtMock());
    service = new AuthService(prisma, jwt);
    process.env.JWT_EXPIRES_IN = '7d';

    await service.generateClientToken(user as any, 'draft-event');

    const nowUnix = Math.floor(FIXED_NOW / 1000);
    expect(calls[0].payload.exp).toBe(nowUnix + parseDurationToSeconds('7d'));
    expect(calls[0].payload.sessionExpiresAt).toBeUndefined();
  });

  it('événement introuvable : utilise le fallback', async () => {
    prisma = makePrismaMock(null);
    ({ jwt, calls } = makeJwtMock());
    service = new AuthService(prisma, jwt);
    process.env.JWT_EXPIRES_IN = '7d';

    await service.generateClientToken(user as any, 'unknown-slug');

    const nowUnix = Math.floor(FIXED_NOW / 1000);
    expect(calls[0].payload.exp).toBe(nowUnix + parseDurationToSeconds('7d'));
  });

  it('refresh token a la même durée que l\'access token (session événementielle)', async () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    prisma = makePrismaMock({ endDate, status: 'PUBLISHED' });
    ({ jwt, calls } = makeJwtMock());
    service = new AuthService(prisma, jwt);
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-32-chars-min-xxxxxxx';

    await service.generateClientToken(user as any, 'concert-2026');

    // calls[0] = access (exp direct dans le payload), calls[1] = refresh
    // (expiresIn en option, car son payload n'a pas d'exp propre)
    expect(calls).toHaveLength(2);
    const expectedExpUnix = Math.floor(endDate.getTime() / 1000) + 86400;
    const nowUnix = Math.floor(FIXED_NOW / 1000);
    expect(calls[1].options.expiresIn).toBe(`${expectedExpUnix - nowUnix}s`);
    expect(calls[1].payload.type).toBe('refresh');
    expect(calls[1].payload.sessionExpiresAt).toBe(calls[0].payload.sessionExpiresAt);
  });

  it('payload contient sub, email, role (structure conforme CDC §7.6)', async () => {
    process.env.JWT_EXPIRES_IN = '7d';
    await service.generateClientToken(user as any);
    const payload = calls[0].payload;
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('client@example.com');
    expect(payload.role).toBe(Role.CLIENT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AuthService — generateScannerToken()', () => {
  const scannerUser = {
    id: 'scanner-user-1',
    email: 'scanner@example.com',
    name: 'Entrée Nord',
    role: Role.SCANNER,
  };

  it('génère un JWT scanner avec exp = event.endDate + 1h (pas de refresh)', async () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    const prisma2 = makePrismaMock();
    const { jwt, calls } = makeJwtMock();
    const service = new AuthService(prisma2 as any, jwt);
    process.env.JWT_SECRET = 'access-secret-32-chars-min-xxxxxxxx';

    const result = await service.generateScannerToken(scannerUser as any, 'event-1', endDate);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeUndefined(); // scanner : pas de refresh
    expect(calls).toHaveLength(1);
    expect(calls[0].payload.eventId).toBe('event-1');
    expect(calls[0].payload.role).toBe(Role.SCANNER);

    // exp = endDate + 1h, calculé directement dans le payload (pas d'option
    // expiresIn — jsonwebtoken rejette la combinaison payload.exp + options.expiresIn)
    expect(calls[0].options.expiresIn).toBeUndefined();
    const expectedExpUnix = Math.floor(endDate.getTime() / 1000) + 3600;
    const nowUnix = Math.floor(FIXED_NOW / 1000);
    const expectedExpiresInSeconds = Math.max(expectedExpUnix - nowUnix, 3600);
    expect(calls[0].payload.exp).toBe(nowUnix + expectedExpiresInSeconds);
  });
});
