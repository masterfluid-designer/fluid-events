import { SetMetadata } from '@nestjs/common';
import { Role } from '@saas-events/types';

/**
 * Décorateur @Roles(...) — associe les rôles requis à un handler/controller.
 *
 * ⚠️ Règle absolue du CDC §4.3 : JwtAuthGuard TOUJOURS en premier, puis RolesGuard.
 *
 * @example
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(Role.SUPER_ADMIN)
 * findAll() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

/** Clé de metadata utilisée par RolesGuard. */
export const ROLES_KEY = 'roles';
