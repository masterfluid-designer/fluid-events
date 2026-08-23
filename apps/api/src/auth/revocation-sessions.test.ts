/**
 * Tests — révocation des sessions après réinitialisation (2026-08-23).
 *
 * Ce que ces tests protègent tient en une phrase : **on change son mot de
 * passe parce qu'il est compromis**. Si la session de celui qui l'avait
 * survit, l'opération est décorative.
 *
 * Et elle survivait longtemps : un jeton d'accès vaut sept jours par défaut,
 * celui d'un agent de contrôle court jusqu'à la fin de l'événement — des mois
 * pour un festival annoncé tôt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ErrorCodes, Role } from '@saas-events/types';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordResetService } from './password-reset.service';

process.env.JWT_SECRET ??= 'secret-de-test';

function corps(err: unknown): { code?: string; message?: string } {
  return (err as { response: Record<string, unknown> }).response as never;
}

const PAYLOAD = {
  sub: 'usr-1',
  email: 'a@x.test',
  role: Role.MANAGER,
  iat: 0,
  exp: 0,
};

describe('JwtStrategy — comparaison de la version des jetons', () => {
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { user: { findUnique: vi.fn() } };
    strategy = new JwtStrategy(prisma as never);
  });

  it('accepte un jeton dont la version correspond', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 3, isActive: true });

    const user = await strategy.validate({ ...PAYLOAD, tv: 3 });

    expect(user.id).toBe('usr-1');
  });

  it('refuse un jeton dont la version est dépassée', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 4, isActive: true });

    const err = await strategy.validate({ ...PAYLOAD, tv: 3 }).catch((e) => e);

    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(corps(err).code).toBe(ErrorCodes.SESSION_REVOKED);
  });

  /*
   * Compatibilité du déploiement : les jetons émis avant l'introduction de
   * `tv` n'en portent pas. Les rejeter déconnecterait tout le monde à la mise
   * en ligne — une panne pour tous, pour corriger un risque pour personne.
   */
  it('lit un jeton sans version comme la version 0', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, isActive: true });

    const user = await strategy.validate({ ...PAYLOAD });

    expect(user.id).toBe('usr-1');
  });

  it('refuse un jeton sans version dès que le compte a été réinitialisé', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 1, isActive: true });

    const err = await strategy.validate({ ...PAYLOAD }).catch((e) => e);

    expect(corps(err).code).toBe(ErrorCodes.SESSION_REVOKED);
  });


  /*
   * Désactiver un compte ne le mettait pas dehors : il gardait sa session
   * jusqu'à sept jours, et pour un agent jusqu'à la fin de l'événement. La
   * seule mesure réellement efficace était la suppression, qui emporte tout.
   */
  it('refuse un compte désactivé, même avec un jeton à jour', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, isActive: false });

    const err = await strategy.validate({ ...PAYLOAD, tv: 0 }).catch((e) => e);

    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(corps(err).code).toBe(ErrorCodes.ACCOUNT_DISABLED);
  });

  /*
   * L'ordre compte : répondre « reconnectez-vous » à quelqu'un dont le compte
   * est fermé — donc à qui la reconnexion est justement refusée — serait une
   * impasse.
   */
  it('annonce la désactivation avant la révocation, pas l’inverse', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 9, isActive: false });

    const err = await strategy.validate({ ...PAYLOAD, tv: 0 }).catch((e) => e);

    expect(corps(err).code).toBe(ErrorCodes.ACCOUNT_DISABLED);
  });

  it('refuse un jeton dont le compte a disparu', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const err = await strategy.validate({ ...PAYLOAD, tv: 0 }).catch((e) => e);

    expect(corps(err).code).toBe(ErrorCodes.UNAUTHORIZED);
  });

  /* Une seule lecture, par clé primaire : c'est le prix par requête. */
  it('ne lit que la version, et par identifiant', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, isActive: true });

    await strategy.validate({ ...PAYLOAD, tv: 0 });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'usr-1' },
      select: { tokenVersion: true, isActive: true },
    });
  });

  it('refuse un payload malformé avant même de lire la base', async () => {
    const err = await strategy
      .validate({ ...PAYLOAD, email: undefined } as never)
      .catch((e) => e);

    expect(corps(err).code).toBe(ErrorCodes.UNAUTHORIZED);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('PasswordResetService — incrément de la version', () => {
  const SECRET = 'a'.repeat(64);
  const JETON = `usr-1.${SECRET}`;

  it('incrémente la version, ce qui coupe toutes les sessions ouvertes', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'usr-1',
          email: 'a@x.test',
          isActive: true,
          isGuest: false,
          passwordResetTokenHash: createHash('sha256').update(SECRET).digest('hex'),
          passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new PasswordResetService(
      prisma as never,
      { log: vi.fn() } as never,
      { sendPasswordResetEmail: vi.fn() } as never,
    );

    await service.reinitialiser(JETON, 'nouveau-mot-de-passe');

    expect(prisma.user.update.mock.calls[0][0].data.tokenVersion).toEqual({ increment: 1 });
  });

  /*
   * `increment` et non une valeur calculée : deux réinitialisations
   * concurrentes lisant la même version écriraient le même nombre, et la
   * seconde ne révoquerait rien.
   */
  it('incrémente sans relire, pour ne pas perdre une révocation concurrente', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'usr-1',
          email: 'a@x.test',
          isActive: true,
          isGuest: false,
          passwordResetTokenHash: createHash('sha256').update(SECRET).digest('hex'),
          passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new PasswordResetService(
      prisma as never,
      { log: vi.fn() } as never,
      { sendPasswordResetEmail: vi.fn() } as never,
    );

    await service.reinitialiser(JETON, 'nouveau-mot-de-passe');

    // La version courante n'est jamais lue : rien à sélectionner, rien à perdre.
    expect(prisma.user.findUnique.mock.calls[0][0].select.tokenVersion).toBeUndefined();
  });
});
