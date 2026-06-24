import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restringe el endpoint a usuarios que tengan AL MENOS UNO de los roles indicados.
 * Se aplica en cascada con @Permission: ambos deben pasar.
 *
 * @example @Roles('super-admin', 'admin')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
