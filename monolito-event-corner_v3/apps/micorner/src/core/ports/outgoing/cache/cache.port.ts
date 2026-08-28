import { Result } from "@app/result";

export interface ICache {
    get<T>(key: string): Promise<Result<T | null>>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<Result<void>>;
    delete(key: string): Promise<Result<void>>;
    deletePattern(pattern: string): Promise<Result<number>>;
    exists(key: string): Promise<Result<boolean>>;
}