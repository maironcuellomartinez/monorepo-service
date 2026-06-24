import { Injectable, Logger } from '@nestjs/common';
import NodeCache = require('node-cache');

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);
    private readonly cache: NodeCache;

    constructor() {
        this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            return this.cache.get<T>(key) ?? null;
        } catch (error) {
            this.logger.error(`Cache get error for key ${key}: ${(error as Error).message}`);
            return null;
        }
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
        try {
            return this.cache.set(key, value, ttl ?? 3600);
        } catch (error) {
            this.logger.error(`Cache set error for key ${key}: ${(error as Error).message}`);
            return false;
        }
    }

    async delete(key: string): Promise<number> {
        try {
            return this.cache.del(key);
        } catch (error) {
            this.logger.error(`Cache delete error for key ${key}: ${(error as Error).message}`);
            return 0;
        }
    }

    async deletePattern(pattern: string): Promise<void> {
        try {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            const matching = this.cache.keys().filter(k => regex.test(k));
            matching.forEach(k => this.cache.del(k));
            this.logger.log(`Deleted ${matching.length} cache keys for pattern: ${pattern}`);
        } catch (error) {
            this.logger.error(`Cache deletePattern error: ${(error as Error).message}`);
        }
    }

    async flush(): Promise<void> {
        this.cache.flushAll();
    }
}
