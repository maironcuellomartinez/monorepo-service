import { SetMetadata } from '@nestjs/common';

/**
 * Marca un endpoint/controller como interno (M2M).
 * Requiere Authorization: Bearer <JWT M2M> emitido por ABAC con type='service'.
 * Solo servicios de la infraestructura con token válido pueden llamar estos endpoints.
 */
export const IS_INTERNAL = 'isInternal';
export const InternalOnly = () => SetMetadata(IS_INTERNAL, true);
