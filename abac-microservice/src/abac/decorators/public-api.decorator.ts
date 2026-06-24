import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_API_KEY = 'isPublicApi';
export const PublicApi = () => SetMetadata(IS_PUBLIC_API_KEY, true);
