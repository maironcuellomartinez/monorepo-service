import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
    resource: string;
    action: string;
}

/**
 * Declara el permiso ABAC requerido para acceder al endpoint.
 * El AbacGuard lo leerá y llamará a POST /abac/can-access.
 *
 * @example @Permission('appointment', 'create')
 */
export const Permission = (resource: string, action: string) =>
    SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);
