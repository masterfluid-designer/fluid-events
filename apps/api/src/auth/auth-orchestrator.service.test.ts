/**
 * Tests unitaires — AuthOrchestratorService.setPassword()
 * Consomme le token d'invitation Manager (CDC §14.3, décision produit 2026-07-14) :
 * token inconnu → invalide, token expiré → expiré, sinon hash + effacement du token
 * (usage unique) + audit log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthOrchestratorService } from './auth-orchestrator.service';
import { ErrorCodes, Role } from '@saas-events/types';
import type { GoogleProfile } from './strategies/google.strategy';

function makePrisma(user?: { id: string; email: string; inviteTokenExpiresAt: Date | null } | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

describe('AuthOrchestratorService.setPassword()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: AuthOrchestratorService;

  beforeEach(() => {
    audit = makeAudit();
  });

  it('rejette un token inconnu (INVITE_TOKEN_INVALID)', async () => {
    prisma = makePrisma(null);
    service = new AuthOrchestratorService(prisma as any, {} as any, {} as any, audit as any);

    await expect(service.setPassword('bad-token', 'password123')).rejects.toThrow(BadRequestException);
    await expect(service.setPassword('bad-token', 'password123')).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.INVITE_TOKEN_INVALID }),
    });
  });

  it('rejette un token expiré (INVITE_TOKEN_EXPIRED) et ne modifie pas le user', async () => {
    prisma = makePrisma({
      id: 'user-1',
      email: 'manager@example.com',
      inviteTokenExpiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    service = new AuthOrchestratorService(prisma as any, {} as any, {} as any, audit as any);

    await expect(service.setPassword('expired-token', 'password123')).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.INVITE_TOKEN_EXPIRED }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hash le mot de passe, efface le token (usage unique) et journalise', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    prisma = makePrisma({ id: 'user-1', email: 'manager@example.com', inviteTokenExpiresAt: future });
    service = new AuthOrchestratorService(prisma as any, {} as any, {} as any, audit as any);

    const result = await service.setPassword('good-token', 'password123');

    expect(result).toEqual({ success: true });
    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'user-1' });
    expect(updateArgs.data.inviteToken).toBeNull();
    expect(updateArgs.data.inviteTokenExpiresAt).toBeNull();
    expect(await bcrypt.compare('password123', updateArgs.data.passwordHash)).toBe(true);

    expect(audit.log).toHaveBeenCalledWith('auth.password.set', 'User', 'user-1', {
      email: 'manager@example.com',
    });
  });
});

/**
 * AuthOrchestratorService.loginWithGoogle() — intent=become_manager
 * (CDC §14.3, décision produit 2026-07-14) : un compte self-service Manager
 * n'est créé QUE si aucun compte n'existe déjà pour ce googleId — jamais
 * d'escalade de privilège sur un compte existant.
 */
function makeGoogleProfile(): GoogleProfile {
  return { googleId: 'g-1', email: 'prospect@example.com', name: 'Prospect Manager' };
}

function makeGooglePrisma(existingUser?: { id: string } | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser ?? null),
      upsert: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'prospect@example.com',
        role: existingUser ? Role.CLIENT : Role.MANAGER,
        isActive: true,
      }),
    },
  };
}

function makeAuthService() {
  return { generateClientToken: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }) };
}

describe('AuthOrchestratorService.loginWithGoogle() — intent=become_manager', () => {
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    audit = makeAudit();
  });

  it("crée un nouveau compte MANAGER self-service (isSelfService=true, subscriptionActive=false) et journalise", async () => {
    const prisma = makeGooglePrisma(null);
    const authService = makeAuthService();
    const service = new AuthOrchestratorService(prisma as any, authService as any, {} as any, audit as any);

    await service.loginWithGoogle(makeGoogleProfile(), undefined, 'become_manager');

    const upsertArgs = prisma.user.upsert.mock.calls[0][0];
    expect(upsertArgs.create).toEqual(
      expect.objectContaining({
        role: Role.MANAGER,
        isSelfService: true,
        subscriptionActive: false,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'auth.manager.selfservice.signup',
      'User',
      'user-1',
      expect.objectContaining({ email: 'prospect@example.com' }),
    );
  });

  it("ne modifie JAMAIS le rôle d'un compte Google déjà existant, même avec intent=become_manager", async () => {
    const prisma = makeGooglePrisma({ id: 'user-1' });
    const authService = makeAuthService();
    const service = new AuthOrchestratorService(prisma as any, authService as any, {} as any, audit as any);

    await service.loginWithGoogle(makeGoogleProfile(), undefined, 'become_manager');

    const upsertArgs = prisma.user.upsert.mock.calls[0][0];
    expect(upsertArgs.update).not.toHaveProperty('role');
    expect(upsertArgs.update).not.toHaveProperty('isSelfService');
    expect(audit.log).not.toHaveBeenCalledWith(
      'auth.manager.selfservice.signup',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('crée un compte CLIENT normal sans intent (comportement existant inchangé)', async () => {
    const prisma = makeGooglePrisma(null);
    prisma.user.upsert.mockResolvedValue({
      id: 'user-2',
      email: 'client@example.com',
      role: Role.CLIENT,
      isActive: true,
    });
    const authService = makeAuthService();
    const service = new AuthOrchestratorService(prisma as any, authService as any, {} as any, audit as any);

    await service.loginWithGoogle(makeGoogleProfile());

    const upsertArgs = prisma.user.upsert.mock.calls[0][0];
    expect(upsertArgs.create.role).toBe(Role.CLIENT);
    expect(upsertArgs.create).not.toHaveProperty('isSelfService');
  });

  it("intent=become_manager sur un email inconnu sans compte existant reste CLIENT si intent absent/différent", async () => {
    const prisma = makeGooglePrisma(null);
    prisma.user.upsert.mockResolvedValue({
      id: 'user-3',
      email: 'prospect@example.com',
      role: Role.CLIENT,
      isActive: true,
    });
    const authService = makeAuthService();
    const service = new AuthOrchestratorService(prisma as any, authService as any, {} as any, audit as any);

    await service.loginWithGoogle(makeGoogleProfile(), undefined, 'buy');

    const upsertArgs = prisma.user.upsert.mock.calls[0][0];
    expect(upsertArgs.create.role).toBe(Role.CLIENT);
  });
});

describe('AuthOrchestratorService.getCurrentUser()', () => {
  it('retourne le user (GET /api/auth/me)', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'u-1', email: 'a@x.com', name: 'A', role: Role.MANAGER, isActive: true }),
      },
    };
    const service = new AuthOrchestratorService(prisma as any, {} as any, {} as any, makeAudit() as any);

    const result = await service.getCurrentUser('u-1');

    expect(result).toEqual({ id: 'u-1', email: 'a@x.com', name: 'A', role: Role.MANAGER, isActive: true });
  });

  it('404 si le user est introuvable (USER_NOT_FOUND)', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new AuthOrchestratorService(prisma as any, {} as any, {} as any, makeAudit() as any);

    await expect(service.getCurrentUser('unknown')).rejects.toThrow(NotFoundException);
  });
});

/**
 * AuthOrchestratorService.stopImpersonation() — CDC §14.3. Le cookie
 * `impersonator_token` doit être un JWT SUPER_ADMIN valide (signature +
 * expiration vérifiées, jamais décodé sans vérification).
 */
describe('AuthOrchestratorService.stopImpersonation()', () => {
  function makeJwt(verifyImpl: (token: string) => any) {
    return { verify: vi.fn(verifyImpl) };
  }

  it("rejette si aucun cookie impersonator_token n'est présent (NOT_IMPERSONATING)", async () => {
    const audit = makeAudit();
    const service = new AuthOrchestratorService({} as any, {} as any, makeJwt(() => {}) as any, audit as any);

    await expect(service.stopImpersonation(undefined)).rejects.toThrow(BadRequestException);
    await expect(service.stopImpersonation(undefined)).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.NOT_IMPERSONATING }),
    });
  });

  it('rejette un token invalide/expiré (TOKEN_EXPIRED)', async () => {
    const jwt = makeJwt(() => {
      throw new Error('jwt expired');
    });
    const audit = makeAudit();
    const service = new AuthOrchestratorService({} as any, {} as any, jwt as any, audit as any);

    await expect(service.stopImpersonation('bad-token')).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.TOKEN_EXPIRED }),
    });
  });

  it("rejette un token valide mais dont le rôle n'est pas SUPER_ADMIN", async () => {
    const jwt = makeJwt(() => ({ sub: 'u-1', email: 'mgr@x.com', role: Role.MANAGER }));
    const audit = makeAudit();
    const service = new AuthOrchestratorService({} as any, {} as any, jwt as any, audit as any);

    await expect(service.stopImpersonation('manager-token')).rejects.toThrow(UnauthorizedException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('restaure le token Admin et journalise la fin de l’impersonation', async () => {
    const jwt = makeJwt(() => ({ sub: 'admin-1', email: 'admin@x.com', role: Role.SUPER_ADMIN }));
    const audit = makeAudit();
    const service = new AuthOrchestratorService({} as any, {} as any, jwt as any, audit as any);

    const result = await service.stopImpersonation('admin-token');

    expect(result).toEqual({ accessToken: 'admin-token' });
    expect(audit.log).toHaveBeenCalledWith('admin.impersonate.end', 'User', 'admin-1', {});
  });
});
