import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import NodeCache = require('node-cache');
import type { Redis } from 'ioredis';
// require en vez de `import Redis from 'ioredis'`: sin esModuleInterop en
// tsconfig, el import por default no resuelve al constructor en runtime.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IORedis = require('ioredis');

const DEFAULT_TTL = 3600;

/**
 * Redis cuando REDIS_URL está configurado y conectado — necesario porque con
 * replicas > 1 (k8s) un caché puramente en memoria hace que invalidar el
 * permiso de un usuario solo afecte al pod que atendió esa request; el resto
 * sigue sirviendo la decisión vieja hasta que expire el TTL.
 *
 * Si Redis no está configurado (REDIS_URL vacío) o no está disponible en
 * este momento (caído, arrancando), cae a un caché local en memoria — mismo
 * comportamiento que tenía el servicio antes de Redis. Nunca bloquea el
 * arranque ni tumba una request por esto: perder Redis degrada a
 * "sin compartir entre réplicas", no a "sin caché" ni a un error.
 *
 * Los errores de ambos backends se atrapan siempre: AbacService trata
 * cualquier excepción como fail-safe deny (ver abac.service.ts), así que
 * dejar que un error de caché se propague denegaría todos los accesos.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
    private readonly logger = new Logger(CacheService.name);
    private readonly local: NodeCache;
    private readonly redis: Redis | null;
    private readonly prefix: string;
    private readonly defaultTtl: number;
    private redisReady = false;
    private hasWarnedDown = false;

    constructor() {
        this.local = new NodeCache({ stdTTL: DEFAULT_TTL, checkperiod: 600 });
        this.prefix = process.env.REDIS_PREFIX ?? 'abac:';
        this.defaultTtl = parseInt(process.env.REDIS_TTL ?? String(DEFAULT_TTL), 10);

        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            this.redis = null;
            this.logger.warn('REDIS_URL no configurado — caché local en memoria (no se comparte entre réplicas)');
            return;
        }

        const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES ?? '3', 10);
        const retryBaseDelay = parseInt(process.env.REDIS_RETRY_BASE_DELAY ?? '1000', 10);

        this.redis = new IORedis(redisUrl, {
            maxRetriesPerRequest: maxRetries,
            retryStrategy: (times: number) => Math.min(times * retryBaseDelay, 10_000),
            lazyConnect: false,
        });

        this.redis!.on('ready', () => {
            this.redisReady = true;
            this.hasWarnedDown = false;
            this.logger.log('Redis conectado — caché compartido entre réplicas');
        });
        // Sin este listener, un error de conexión (Redis caído, DNS, etc.)
        // emitido por el cliente sin nadie escuchando tumba el proceso —
        // ioredis sigue la convención de EventEmitter de Node para 'error'.
        // ioredis reintenta solo con retryStrategy, así que sin el flag este
        // handler loguearía un ERROR por cada intento fallido (varios por
        // segundo) mientras Redis esté caído — es el modo de fallback
        // soportado (caché local), no una falla de la aplicación, así que se
        // avisa una sola vez por caída y a nivel warn, no error.
        this.redis!.on('error', (err: Error) => {
            if (this.hasWarnedDown) return;
            this.hasWarnedDown = true;
            this.logger.warn(`Redis no disponible — usando caché local hasta reconectar: ${err.message}`);
        });
        this.redis!.on('close', () => {
            this.redisReady = false;
        });
    }

    private key(k: string): string {
        return `${this.prefix}${k}`;
    }

    async get<T>(key: string): Promise<T | null> {
        if (this.redis && this.redisReady) {
            try {
                const raw = await this.redis.get(this.key(key));
                return raw === null ? null : (JSON.parse(raw) as T);
            } catch (error) {
                this.logger.error(`Redis get error for key ${key} — probando caché local: ${(error as Error).message}`);
            }
        }
        return this.local.get<T>(key) ?? null;
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
        const effectiveTtl = ttl ?? this.defaultTtl;
        if (this.redis && this.redisReady) {
            try {
                await this.redis.set(this.key(key), JSON.stringify(value), 'EX', effectiveTtl);
                return true;
            } catch (error) {
                this.logger.error(`Redis set error for key ${key} — probando caché local: ${(error as Error).message}`);
            }
        }
        return this.local.set(key, value, effectiveTtl);
    }

    async delete(key: string): Promise<number> {
        let deleted = 0;
        if (this.redis && this.redisReady) {
            try {
                deleted += await this.redis.del(this.key(key));
            } catch (error) {
                this.logger.error(`Redis delete error for key ${key}: ${(error as Error).message}`);
            }
        }
        deleted += this.local.del(key);
        return deleted;
    }

    async deletePattern(pattern: string): Promise<void> {
        let deleted = 0;
        if (this.redis && this.redisReady) {
            try {
                deleted += await this.scanAndDelete(this.key(pattern));
            } catch (error) {
                this.logger.error(`Redis deletePattern error: ${(error as Error).message}`);
            }
        }
        deleted += this.deleteLocalPattern(pattern);
        this.logger.log(`Deleted ${deleted} cache keys for pattern: ${pattern}`);
    }

    async flush(): Promise<void> {
        if (this.redis && this.redisReady) {
            try {
                await this.scanAndDelete(`${this.prefix}*`);
            } catch (error) {
                this.logger.error(`Redis flush error: ${(error as Error).message}`);
            }
        }
        this.local.flushAll();
    }

    private deleteLocalPattern(pattern: string): number {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matching = this.local.keys().filter((k) => regex.test(k));
        matching.forEach((k) => this.local.del(k));
        return matching.length;
    }

    /** SCAN en vez de KEYS: no bloquea Redis mientras recorre el keyspace. */
    private async scanAndDelete(matchPattern: string): Promise<number> {
        let cursor = '0';
        let deleted = 0;
        do {
            const [nextCursor, keys] = await this.redis!.scan(cursor, 'MATCH', matchPattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                deleted += await this.redis!.del(...keys);
            }
        } while (cursor !== '0');
        return deleted;
    }

    async onModuleDestroy(): Promise<void> {
        if (this.redis) {
            await this.redis.quit().catch(() => {});
        }
    }
}
