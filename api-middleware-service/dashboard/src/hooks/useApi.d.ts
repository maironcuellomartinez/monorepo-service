interface UseApiState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}
interface UseApiReturn<T> extends UseApiState<T> {
    execute: (...args: unknown[]) => Promise<T | undefined>;
    reset: () => void;
}
export declare function useApi<T>(apiFunc: (...args: unknown[]) => Promise<T>): UseApiReturn<T>;
export {};
