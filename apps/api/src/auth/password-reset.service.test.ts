/**
 * Tests — récupération de mot de passe (2026-08-23).
 *
 * Deux propriétés valent tout le reste de ce fichier :
 *  - la réponse ne dit JAMAIS si le compte existe ;
 *  - le jeton n'est jamais stocké en clair.
 *
 * Ce sont exactement les deux choses qu'une retouche pressée casse sans s'en
 * apercevoir, parce qu'aucune des deux ne se voit à l'écran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ErrorCodes } from '@saas-events/types';
import { PasswordResetService } from './password-reset.service';

function makePrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

const COMPTE = {
  id: 'usr-1',
  email: 'organisateur@exemple.ci',
  name: 'Awa',
  isActive: true,
  isGuest: false,
  passwordResetRequestedAt: null,
};

function corps(err: unknown): { code?: string; message?: string } {
  return (err as { response: Record<string, unknown> }).response as never;
}

describe('PasswordResetService.demander()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let email: { sendPasswordResetEmail: ReturnType<typeof vi.fn> };
  let service: PasswordResetService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    email = { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) };
    service = new PasswordResetService(prisma as never, audit as never, email as never);
  });

  it('normalise l’adresse avant de chercher', async () => {
    prisma.user.findUnique.mockResolvedValue(COMPTE);

    await service.demander('  Organisateur@Exemple.CI  ');

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'organisateur@exemple.ci' } }),
    );
  });

  /*
   * LE test du fichier. Une réponse différente ferait de ce formulaire public
   * l'annuaire des organisateurs de la plateforme.
   */
  it('répond identiquement, que le compte existe ou non', async () => {
    prisma.user.findUnique.mockResolvedValue(COMPTE);
    const connu = await service.demander(COMPTE.email);

    prisma.user.findUnique.mockResolvedValue(null);
    const inconnu = await service.demander('personne@nulle-part.test');

    expect(connu).toEqual(inconnu);
    expect(inconnu).toEqual({ success: true });
  });

  it('n’écrit rien et n’envoie rien pour une adresse inconnue', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await service.demander('personne@nulle-part.test');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('refuse un compte désactivé, sans le dire', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...COMPTE, isActive: false });

    const r = await service.demander(COMPTE.email);

    expect(r).toEqual({ success: true });
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  /*
   * Les comptes fantômes portent les billets d'un acheteur sans compte. Leur
   * ouvrir une porte par email les offrirait au premier venu qui connaît
   * l'adresse de l'acheteur.
   */
  it('refuse un compte fantôme (achat sans compte)', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...COMPTE, isGuest: true });

    const r = await service.demander(COMPTE.email);

    expect(r).toEqual({ success: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  /*
   * `inviteToken` est stocké en clair ; ce jeton-ci ne doit pas l'être. Une
   * copie de la base suffirait sinon à prendre la main sur n'importe quel
   * compte.
   */
  it('stocke le HACHAGE du secret, jamais le secret', async () => {
    prisma.user.findUnique.mockResolvedValue(COMPTE);

    await service.demander(COMPTE.email);

    const { resetUrl } = email.sendPasswordResetEmail.mock.calls[0][0];
    const jeton = decodeURIComponent(new URL(resetUrl, 'https://x.test').searchParams.get('token')!);
    const secret = jeton.slice(jeton.indexOf('.') + 1);

    const ecrit = prisma.user.update.mock.calls[0][0].data;
    expect(ecrit.passwordResetTokenHash).not.toBe(secret);
    expect(ecrit.passwordResetTokenHash).toBe(createHash('sha256').update(secret).digest('hex'));
  });

  it('préfixe le jeton par l’identifiant du compte, pour retrouver la ligne', async () => {
    prisma.user.findUnique.mockResolvedValue(COMPTE);

    await service.demander(COMPTE.email);

    const { resetUrl } = email.sendPasswordResetEmail.mock.calls[0][0];
    const jeton = decodeURIComponent(new URL(resetUrl, 'https://x.test').searchParams.get('token')!);
    expect(jeton.startsWith(`${COMPTE.id}.`)).toBe(true);
  });

  it('donne une durée de vie et l’annonce à l’email', async () => {
    prisma.user.findUnique.mockResolvedValue(COMPTE);
    const avant = Date.now();

    await service.demander(COMPTE.email);

    const { passwordResetTokenExpiresAt } = prisma.user.update.mock.calls[0][0].data;
    // Borne haute à 61 : `avant` est relevé avant le `new Date()` du service,
    // le test mesure donc une fenêtre légèrement plus large que la vraie.
    const minutes = (passwordResetTokenExpiresAt.getTime() - avant) / 60000;
    expect(minutes).toBeGreaterThan(55);
    expect(minutes).toBeLessThanOrEqual(61);
    expect(email.sendPasswordResetEmail.mock.calls[0][0].validiteMinutes).toBe(60);
  });

  /*
   * Sans cadence, ce formulaire public devient un moyen d'inonder la boîte de
   * quelqu'un — et d'épuiser le quota d'envoi de la plateforme au passage.
   */
  it('refuse une seconde demande dans la minute, sans le dire non plus', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...COMPTE,
      passwordResetRequestedAt: new Date(Date.now() - 10_000),
    });

    const r = await service.demander(COMPTE.email);

    expect(r).toEqual({ success: true });
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('accepte une nouvelle demande passé le délai', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...COMPTE,
      passwordResetRequestedAt: new Date(Date.now() - 120_000),
    });

    await service.demander(COMPTE.email);

    expect(email.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  /*
   * Un échec d'envoi remonté au visiteur redonnerait l'oracle : « erreur » =
   * le compte existe, « succès » = il n'existe pas.
   */
  it('ne laisse pas remonter un échec d’envoi', async () => {
    prisma.user.findUnique.mockResolvedValue(COMPTE);
    email.sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(service.demander(COMPTE.email)).resolves.toEqual({ success: true });
  });
});

describe('PasswordResetService.reinitialiser()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: PasswordResetService;

  const SECRET = 'a'.repeat(64);
  const JETON = `usr-1.${SECRET}`;

  function compteAvecJeton(surcharge: Record<string, unknown> = {}) {
    return {
      id: 'usr-1',
      email: COMPTE.email,
      isActive: true,
      isGuest: false,
      passwordResetTokenHash: createHash('sha256').update(SECRET).digest('hex'),
      passwordResetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      ...surcharge,
    };
  }

  beforeEach(() => {
    prisma = makePrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new PasswordResetService(
      prisma as never,
      audit as never,
      { sendPasswordResetEmail: vi.fn() } as never,
    );
  });

  it('pose le mot de passe et consomme le jeton', async () => {
    prisma.user.findUnique.mockResolvedValue(compteAvecJeton());

    await service.reinitialiser(JETON, 'nouveau-mot-de-passe');

    const ecrit = prisma.user.update.mock.calls[0][0].data;
    expect(ecrit.passwordHash).toEqual(expect.stringMatching(/^\$2[aby]\$/));
    expect(ecrit.passwordResetTokenHash).toBeNull();
    expect(ecrit.passwordResetTokenExpiresAt).toBeNull();
  });

  /*
   * La personne vient de prouver qu'elle tient l'adresse : laisser vivre une
   * invitation en cours n'ajouterait qu'un second chemin d'accès.
   */
  it('périme au passage une invitation encore en cours', async () => {
    prisma.user.findUnique.mockResolvedValue(compteAvecJeton());

    await service.reinitialiser(JETON, 'nouveau-mot-de-passe');

    const ecrit = prisma.user.update.mock.calls[0][0].data;
    expect(ecrit.inviteToken).toBeNull();
    expect(ecrit.inviteTokenExpiresAt).toBeNull();
  });

  it('refuse un secret qui ne correspond pas', async () => {
    prisma.user.findUnique.mockResolvedValue(compteAvecJeton());

    const err = await service.reinitialiser(`usr-1.${'b'.repeat(64)}`, 'motdepasse1').catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(corps(err).code).toBe(ErrorCodes.INVITE_TOKEN_INVALID);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuse un jeton expiré, et le dit', async () => {
    prisma.user.findUnique.mockResolvedValue(
      compteAvecJeton({ passwordResetTokenExpiresAt: new Date(Date.now() - 1000) }),
    );

    const err = await service.reinitialiser(JETON, 'motdepasse1').catch((e) => e);

    expect(corps(err).code).toBe(ErrorCodes.INVITE_TOKEN_EXPIRED);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuse un jeton déjà consommé', async () => {
    prisma.user.findUnique.mockResolvedValue(compteAvecJeton({ passwordResetTokenHash: null }));

    const err = await service.reinitialiser(JETON, 'motdepasse1').catch((e) => e);

    expect(corps(err).code).toBe(ErrorCodes.INVITE_TOKEN_INVALID);
  });

  it('refuse un compte fantôme même avec un jeton valide', async () => {
    prisma.user.findUnique.mockResolvedValue(compteAvecJeton({ isGuest: true }));

    const err = await service.reinitialiser(JETON, 'motdepasse1').catch((e) => e);

    expect(corps(err).code).toBe(ErrorCodes.INVITE_TOKEN_INVALID);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  /*
   * « Mal formé », « compte inconnu », « déjà utilisé » et « mauvais secret »
   * répondent la même chose : les distinguer dirait au curieux lequel des
   * quatre murs il vient de heurter.
   */
  it('répond la même chose à toutes les formes d’échec sauf l’expiration', async () => {
    const reponses: unknown[] = [];

    for (const jeton of ['', 'sans-point', '.secret-sans-id']) {
      reponses.push(corps(await service.reinitialiser(jeton, 'motdepasse1').catch((e) => e)));
    }

    prisma.user.findUnique.mockResolvedValue(null);
    reponses.push(corps(await service.reinitialiser(JETON, 'motdepasse1').catch((e) => e)));

    prisma.user.findUnique.mockResolvedValue(compteAvecJeton());
    reponses.push(
      corps(await service.reinitialiser(`usr-1.${'c'.repeat(64)}`, 'motdepasse1').catch((e) => e)),
    );

    expect(new Set(reponses.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it('journalise la réinitialisation', async () => {
    prisma.user.findUnique.mockResolvedValue(compteAvecJeton());

    await service.reinitialiser(JETON, 'motdepasse1');

    expect(audit.log).toHaveBeenCalledWith(
      'auth.password.reset',
      'User',
      'usr-1',
      expect.objectContaining({ email: COMPTE.email }),
    );
  });
});
