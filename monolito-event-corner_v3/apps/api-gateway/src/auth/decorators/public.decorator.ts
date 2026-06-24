import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marca un endpoint como público — omite JwtGuard y AbacGuard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
