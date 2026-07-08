import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@saas-events/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard — Vérifie que l'utilisateur authentifié possède l'un des rôles requis.
 *
 * ⚠️ Doit TOUJOURS être précédé de JwtAuthGuard (CDC §4.3).
 * JwtAuthGuard authentifie (peuple req.user), RolesGuard autorise (vérifie le rôle).
 *
 * Si aucune metadata 'roles' n'est posée → route autorisée (pas de restriction RBAC).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Pas de rôles requis → autorisé (la route peut néanmoins exiger JwtAuthGuard)
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) return false;

    return requiredRoles.some((role) => user.role === role);
  }
}
