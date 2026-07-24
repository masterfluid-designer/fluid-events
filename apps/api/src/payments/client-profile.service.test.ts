/**
 * Tests unitaires — ClientProfileService
 * Enrichissement de profil post-paiement (CDC §7.9).
 *
 * Règle absolue : on NE JAMAIS écraser phone/country existants.
 * On ne renseigne ces champs que s'ils sont absents en base.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientProfileService } from './client-profile.service';
import { PhoneService } from '../notifications/phone.service';

describe('ClientProfileService — buildEnrichmentData()', () => {
  let service: ClientProfileService;
  let userFindUnique: ReturnType<typeof vi.fn>;
  let phoneService: PhoneService;

  beforeEach(() => {
    phoneService = new PhoneService();
    userFindUnique = vi.fn();
    const prisma = { user: { findUnique: userFindUnique, update: vi.fn() } } as any;
    service = new ClientProfileService(prisma, phoneService);
  });

  it('retourne null si l\'utilisateur est introuvable', () => {
    userFindUnique.mockResolvedValue(null);
    const result = service.buildEnrichmentData(null as any, { phone: '+22890123456' });
    expect(result).toBeNull();
  });

  it('retourne les données à enrichir quand phone ET country sont absents', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: null, country: null },
      { phone: '+22890123456', country: 'TG' },
    );
    expect(result).toEqual({
      phone: '+22890123456',
      country: 'TG',
    });
  });

  it('N\'écrase PAS un téléphone déjà renseigné', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: '+22811111111', country: null },
      { phone: '+22890123456', country: 'TG' },
    );
    expect(result?.phone).toBeUndefined(); // undefined = pas de mise à jour Prisma
    expect(result?.country).toBe('TG'); // country encore absent → renseigné
  });

  it('N\'écrase PAS un pays déjà renseigné', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: null, country: 'CI' },
      { phone: '+22890123456', country: 'TG' },
    );
    expect(result?.phone).toBe('+22890123456');
    expect(result?.country).toBeUndefined(); // déjà CI
  });

  it('N\'écrase RIEN si tout est déjà renseigné', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: '+22811111111', country: 'CI' },
      { phone: '+22890123456', country: 'TG' },
    );
    expect(result?.phone).toBeUndefined();
    expect(result?.country).toBeUndefined();
  });

  it('ignore un téléphone invalide du payload provider', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: null, country: null },
      { phone: 'invalide', country: 'TG' },
    );
    expect(result?.phone).toBeUndefined(); // invalide → ignoré
    expect(result?.country).toBe('TG');
  });

  it('ignore un code pays invalide (non ISO 2 lettres)', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: null, country: null },
      { phone: '+22890123456', country: 'TOGO' },
    );
    expect(result?.phone).toBe('+22890123456');
    expect(result?.country).toBeUndefined(); // 'TOGO' invalide → ignoré
  });

  it('normalise le code pays en majuscules', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: null, country: null },
      { phone: '+22890123456', country: 'tg' },
    );
    expect(result?.country).toBe('TG');
  });

  it('gère un payload vide (rien à enrichir)', () => {
    const result = service.buildEnrichmentData(
      { id: 'u1', phone: null, country: null },
      {},
    );
    expect(result?.phone).toBeUndefined();
    expect(result?.country).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ClientProfileService — enrichClientProfile() (persistance)', () => {
  let service: ClientProfileService;
  let updateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const phoneService = new PhoneService();
    updateMock = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      user: { findUnique: vi.fn(), update: updateMock },
    } as any;
    service = new ClientProfileService(prisma, phoneService);
  });

  it('ne fait rien si user introuvable', async () => {
    await expect(
      service.enrichClientProfile('unknown', { phone: '+22890123456' }),
    ).resolves.toBeUndefined();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('persiste l\'enrichissement via prisma.user.update', async () => {
    // On mocke findUnique pour retourner un user sans phone/country
    const phoneService = new PhoneService();
    const findUnique = vi.fn().mockResolvedValue({ id: 'u1', phone: null, country: null });
    const prisma = { user: { findUnique, update: updateMock } } as any;
    service = new ClientProfileService(prisma, phoneService);

    await service.enrichClientProfile('u1', { phone: '+22890123456', country: 'TG' });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        phone: '+22890123456',
        country: 'TG',
        profileCompletedAt: expect.any(Date),
      }),
    });
  });

  it("n'écrit rien (et n'estampille pas profileCompletedAt) quand phone/country sont déjà renseignés", async () => {
    const phoneService = new PhoneService();
    const findUnique = vi.fn().mockResolvedValue({ id: 'u1', phone: '+22811111111', country: 'CI' });
    const prisma = { user: { findUnique, update: updateMock } } as any;
    service = new ClientProfileService(prisma, phoneService);

    await service.enrichClientProfile('u1', { phone: '+22890123456', country: 'TG' });

    expect(updateMock).not.toHaveBeenCalled();
  });
});
