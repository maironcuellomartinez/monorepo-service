import { SetMetadata } from '@nestjs/common';

/**
 * @description Decorator to mark handlers with required permissions.
 * Usage: @Permissions('order:read', 'order:write')
 */
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
