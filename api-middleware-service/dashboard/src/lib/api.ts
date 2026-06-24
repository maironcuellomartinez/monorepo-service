import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Admin session management (cookie-based)

export async function loginAdmin(username: string, password: string): Promise<void> {
  await api.post('/admin/login', { username, password });
}

export async function logoutAdmin(): Promise<void> {
  await api.post('/admin/logout');
}

export async function checkSession(): Promise<{ username: string } | null> {
  try {
    const { data } = await api.get('/admin/me');
    return { username: data.username };
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await checkSession();
  return session !== null;
}

export async function checkSetupRequired(): Promise<{ setupRequired: boolean }> {
  const { data } = await api.get('/admin/setup-required');
  return data;
}

// JWT Access Token management

export function setAccessToken(token: string): void {
  sessionStorage.setItem('access_token', token);
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem('access_token');
}

export function clearAccessToken(): void {
  sessionStorage.removeItem('access_token');
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string[];
}

export async function fetchToken(
  clientId: string,
  clientSecret: string,
  scope?: string,
): Promise<TokenResponse> {
  const credentials = btoa(clientId + ':' + clientSecret);
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  if (scope) {
    params.append('scope', scope);
  }

  const { data } = await axios.post<TokenResponse>('/api/oauth/token', params.toString(), {
    headers: {
      'Authorization': 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return data;
}

export interface Client {
  clientId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  tokenExpiresInSeconds: number;
  allowedScopes: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientPayload {
  clientName: string;
  description?: string;
  scopes?: string[];
  tokenExpiresInSeconds?: number;
}

export interface CreateClientResult {
  clientId: string;
  clientSecret: string;
  name: string;
  message: string;
}

export interface RequestRecord {
  id: number;
  requestNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
}

export interface GatewayBulkhead {
  pending: number;
  size: number;
  concurrency: number;
}

export interface GatewayStatus {
  circuitBreaker: { state: 'OPEN' | 'HALF_OPEN' | 'CLOSED'; stats: Record<string, unknown> };
  bulkhead: { high: GatewayBulkhead; low: GatewayBulkhead };
}

export interface HttpBulkheadStats {
  activeCalls: number;
  queuedCalls: number;
  maxConcurrentCalls: number;
  maxQueueSize: number;
  totalCalls: number;
}

export interface HealthStatusResponse {
  status: string;
  gateway: GatewayStatus | { error: string };
  bulkhead: HttpBulkheadStats | { error: string };
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<{ status: string; uptime: number; timestamp: string }>('/health/ping');
  return {
    status: data.status === 'ok' ? 'ok' : 'degraded',
    uptime: data.uptime,
    timestamp: data.timestamp,
  };
}

export async function fetchHealthStatus(): Promise<HealthStatusResponse> {
  // terminus devuelve 503 cuando algún check falla pero el body siempre contiene los datos.
  // validateStatus evita que axios lance en 503 para que podamos leer el cuerpo igualmente.
  const { data } = await api.get<HealthStatusResponse>('/health/status', {
    validateStatus: (s) => s === 200 || s === 503,
  });
  return data;
}

export async function fetchClients(): Promise<Client[]> {
  const { data } = await api.get('/clients', { params: { limit: 100 } });
  return Array.isArray(data) ? data : (data.data ?? []);
}

export async function fetchClient(clientId: string): Promise<Client> {
  const { data } = await api.get('/clients/' + clientId);
  return data;
}

export async function createClient(payload: CreateClientPayload): Promise<CreateClientResult> {
  const { data } = await api.post('/clients', {
    name: payload.clientName,
    description: payload.description,
    scopes: payload.scopes && payload.scopes.length > 0 ? payload.scopes : undefined,
    tokenExpiresInSeconds: payload.tokenExpiresInSeconds,
  });
  return data;
}

export async function rotateSecret(clientId: string): Promise<CreateClientResult> {
  const { data } = await api.patch('/clients/' + clientId + '/rotate-secret');
  return data;
}

export async function updateTokenExpiry(clientId: string, tokenExpiresInSeconds: number): Promise<Client> {
  const { data } = await api.patch('/clients/' + clientId + '/token-expiry', { tokenExpiresInSeconds });
  return data;
}

export async function deactivateClient(clientId: string): Promise<void> {
  await api.delete('/clients/' + clientId);
}

export async function reactivateClient(clientId: string): Promise<Client> {
  const { data } = await api.patch('/clients/' + clientId + '/reactivate');
  return data;
}

export async function deleteClient(clientId: string): Promise<void> {
  await api.delete('/clients/' + clientId + '/permanent');
}

export async function fetchRecords(params?: Record<string, unknown>): Promise<unknown> {
  const { data } = await api.get('/v1/requests', { params });
  return data;
}

export async function fetchRecordByNumber(number: string): Promise<unknown> {
  const { data } = await api.get('/v1/requests/' + number);
  return data;
}

export interface Issue {
  id?: string | number;
  serviceNowId?: string;
  serviceNowTaskNumber?: string;
  serviceNowTaskId?: string;
  tipology?: string;
  descripcion?: string;
  customerUser?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

export async function fetchIssues(params?: Record<string, string>): Promise<Issue[]> {
  const { data } = await api.get('/v1/issues', { params });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
