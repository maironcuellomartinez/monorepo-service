import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * Marca un endpoint como público — omite InternalTokenGuard.
 *
 * InternalTokenGuard está montado como APP_GUARD en internal-api.module.ts.
 * Pese a declararse dentro de ese módulo, NestJS aplica APP_GUARD a TODA la
 * aplicación, no solo al módulo que lo provee — por eso alcanzaba también a
 * rutas de fuera de internal-api (health) que nunca se pensaron protegidas.
 *
 * Usar con criterio: el micorner no está expuesto a clientes externos, así
 * que lo único que debería llevar este decorador son las sondas de salud.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
