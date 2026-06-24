export declare function setAdminApiKey(key: string): void;
export declare function getAdminApiKey(): string | null;
export declare function clearAdminApiKey(): void;
export declare function isAuthenticated(): boolean;
export interface HealthResponse {
    status: string;
    uptime: number;
    timestamp: string;
}
export interface CircuitBreakerStatus {
    state: string;
    stats: Record<string, unknown>;
}
export interface BulkheadGroupStatus {
    pending: number;
    size: number;
    concurrency: number;
}
export interface HealthStatusResponse {
    httpBulkhead: {
        active: number;
        queued: number;
        concurrency: number;
        maxQueueSize: number;
    };
    circuitBreaker: CircuitBreakerStatus;
    bulkhead: {
        high: BulkheadGroupStatus;
        low: BulkheadGroupStatus;
    };
}
export declare function fetchHealth(): Promise<HealthResponse>;
export declare function fetchHealthStatus(): Promise<HealthStatusResponse>;
export interface Client {
    id: number;
    clientId: string;
    clientName: string;
    description?: string;
    scopes: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface CreateClientPayload {
    clientName: string;
    description?: string;
    scopes?: string[];
}
export interface CreateClientResult {
    client: Client;
    clientSecret: string;
}
export declare function fetchClients(): Promise<Client[]>;
export declare function fetchClient(clientId: string): Promise<Client>;
export declare function createClient(payload: CreateClientPayload): Promise<CreateClientResult>;
export declare function rotateSecret(clientId: string): Promise<CreateClientResult>;
export declare function deactivateClient(clientId: string): Promise<Client>;
export interface RequestRecord {
    id: number;
    requestNumber: string;
    clientId: string;
    status: string;
    method: string;
    path: string;
    createdAt: string;
    updatedAt: string;
}
export interface ListRecordsParams {
    status?: string;
    clientId?: string;
    limit?: number;
    offset?: number;
}
export declare function fetchRecords(params?: ListRecordsParams): Promise<RequestRecord[]>;
export declare function fetchRecordByNumber(number: string): Promise<RequestRecord>;
