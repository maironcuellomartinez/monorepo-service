import { registerAs } from '@nestjs/config';

/**
 * @description Cache / Redis config
 */
export default registerAs('cache', () => ({
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
}));
