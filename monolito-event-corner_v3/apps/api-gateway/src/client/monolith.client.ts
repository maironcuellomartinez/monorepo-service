// api-gateway/client/monolith.client.ts
import { Injectable, HttpException, InternalServerErrorException } from '@nestjs/common';
import { HttpClient } from '@backendkit-labs/http-client';
import type { HttpClientError, RequestConfig } from '@backendkit-labs/http-client';
import { InjectHttpClient } from '@backendkit-labs/http-client/nestjs';
import { MONOLITH_HTTP } from '../http/http-client.tokens';

@Injectable()
export class MonolithClient {
    private readonly authHeaders: Record<string, string>;

    constructor(@InjectHttpClient(MONOLITH_HTTP) private readonly http: HttpClient) {
        this.authHeaders = { Authorization: `Bearer ${process.env.ABAC_M2M_TOKEN ?? ''}` };
    }

    private cfg(params?: Record<string, string | undefined>): RequestConfig {
        return { params, headers: this.authHeaders };
    }

    async get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
        const res = await this.http.get<T>(`/internal${path}`, this.cfg(params));
        if (!res.ok) this.rethrow(res.error);
        return res.value.data;
    }

    async post<T>(path: string, body?: unknown, params?: Record<string, string | undefined>): Promise<T> {
        const res = await this.http.post<T>(`/internal${path}`, body, this.cfg(params));
        if (!res.ok) this.rethrow(res.error);
        return res.value.data;
    }

    async put<T>(path: string, body?: unknown, params?: Record<string, string | undefined>): Promise<T> {
        const res = await this.http.put<T>(`/internal${path}`, body, this.cfg(params));
        if (!res.ok) this.rethrow(res.error);
        return res.value.data;
    }

    async patch<T>(path: string, body?: unknown, params?: Record<string, string | undefined>): Promise<T> {
        const res = await this.http.patch<T>(`/internal${path}`, body, this.cfg(params));
        if (!res.ok) this.rethrow(res.error);
        return res.value.data;
    }

    async delete<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
        const res = await this.http.delete<T>(`/internal${path}`, this.cfg(params));
        if (!res.ok) this.rethrow(res.error);
        return res.value.data;
    }

    async getAppointmentByNumber(number: string): Promise<unknown> {
        return this.get(`/appointments/by-number/${encodeURIComponent(number)}`);
    }

    async listAppointments(params: Record<string, string | undefined>): Promise<unknown> {
        return this.get('/appointments', params);
    }

    private rethrow(err: HttpClientError): never {
        if (err.type === 'http') {
            throw new HttpException(err.data ?? err.message, err.status ?? 500);
        }
        throw new InternalServerErrorException('Monolith unreachable');
    }
}
