/**
 * Tests unitaires — RolesGuard
 * Vérifie la matrice RBAC (CDC §4.2, §4.3).
 *
 * Stratégie : mock du Reflector (et non un vrai Reflector + faux contexte),
 * car la metadata posée par @Roles() n'est lisible que via Reflector sur un
 * handler réellement décoré. On teste donc la logique du guard de façon isolée.
 */
import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from '@saas-events/types';

/** Crée un Reflector mock qui renvoie `requiredRoles` (ou undefined). */
function makeReflector(requiredRoles?: Role[]) {
  return {
    getAllAndOverride: vi.fn(() => requiredRoles),
  } as any;
}

/** Crée un ExecutionContext avec un user (ou aucun). */
function makeContext(userRole: Role | null): ExecutionContext {
  const req = userRole ? { user: { role: userRole } } : {};
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('RolesGuard', () => {
  it('autorise si aucun rôle requis n\'est défini (route publique)', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext(Role.CLIENT))).toBe(true);
  });

  it('autorise si la liste des rôles requis est vide', () => {
    const guard = new RolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext(Role.CLIENT))).toBe(true);
  });

  it('autorise si l\'utilisateur a le rôle requis', () => {
    const guard = new RolesGuard(makeReflector([Role.SUPER_ADMIN]));
    expect(guard.canActivate(makeContext(Role.SUPER_ADMIN))).toBe(true);
  });

  it('refuse si l\'utilisateur n\'a pas le bon rôle', () => {
    const guard = new RolesGuard(makeReflector([Role.SUPER_ADMIN]));
    expect(guard.canActivate(makeContext(Role.CLIENT))).toBe(false);
  });

  it('autorise parmi plusieurs rôles requis (OR logique)', () => {
    const guard = new RolesGuard(makeReflector([Role.SUPER_ADMIN, Role.MANAGER]));
    expect(guard.canActivate(makeContext(Role.MANAGER))).toBe(true);
  });

  it('refuse un scanner sur une route client', () => {
    const guard = new RolesGuard(makeReflector([Role.CLIENT]));
    expect(guard.canActivate(makeContext(Role.SCANNER))).toBe(false);
  });

  it('refuse un client sur une route scanner', () => {
    const guard = new RolesGuard(makeReflector([Role.SCANNER]));
    expect(guard.canActivate(makeContext(Role.CLIENT))).toBe(false);
  });

  it('refuse si pas d\'utilisateur dans la requête', () => {
    const guard = new RolesGuard(makeReflector([Role.CLIENT]));
    expect(guard.canActivate(makeContext(null))).toBe(false);
  });
});
