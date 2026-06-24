// infrastructure/cache/local-cache.adapter.ts
import { Injectable } from '@nestjs/common';
import NodeCache = require('node-cache');
import { ICache } from '../../core/ports/outgoing/cache/cache.port';
import { Result } from '@app/result';

@Injectable()
export class LocalCacheAdapter implements ICache {
    private cache: NodeCache;

    constructor() {
        this.cache = new NodeCache({ stdTTL: 30, checkperiod: 60 });
    }

    async get<T>(key: string): Promise<Result<T | null>> {
        const value = this.cache.get<T>(key);
        return Result.ok(value ?? null);
    }

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<Result<void>> {
        this.cache.set(key, value, ttlSeconds ?? 30);
        return Result.ok(undefined);
    }

    async delete(key: string): Promise<Result<void>> {
        this.cache.del(key);
        return Result.ok(undefined);
    }

    async deletePattern(pattern: string): Promise<Result<number>> {
        const keys = this.cache.keys();
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        const toDelete = keys.filter(k => regex.test(k));
        let count = 0;
        toDelete.forEach(k => { this.cache.del(k); count++; });
        return Result.ok(count);
    }

    async exists(key: string): Promise<Result<boolean>> {
        return Result.ok(this.cache.has(key));
    }
}