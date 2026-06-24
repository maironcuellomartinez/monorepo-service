import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { GatewayClient } from './gateway.client';
import { CircuitBreakerOpenError } from '@backendkit-labs/circuit-breaker';

const mockBreaker = {
    execute:    jest.fn(),
    getMetrics: jest.fn(),
};

jest.mock('@backendkit-labs/circuit-breaker', () => {
    class CircuitBreakerOpenError extends Error {
        constructor(name: string) { super(`Circuit ${name} is open`); this.name = 'CircuitBreakerOpenError'; }
    }
    return {
        CircuitBreakerRegistry: jest.fn(() => ({ getOrCreate: jest.fn(() => mockBreaker) })),
        CircuitBreakerOpenError,
        CircuitBreakerState:    { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' },
        isHttpServerError:      jest.fn(),
    };
});

describe('GatewayClient', () => {
    let client: GatewayClient;
    let httpService: jest.Mocked<HttpService>;
    let configService: jest.Mocked<ConfigService>;

    const mockAxiosResponse = (data: any, status = 200): AxiosResponse => ({
        data, status, statusText: 'OK', headers: {}, config: {} as any,
    });

    beforeEach(async () => {
        mockBreaker.execute.mockReset();
        mockBreaker.getMetrics.mockReturnValue({
            name: 'api-gateway', state: 'closed', failureRate: 0, slowCallRate: 0,
            bufferedCalls: 0, totalCalls: 0, successfulCalls: 0, failedCalls: 0,
            slowCalls: 0, notPermittedCalls: 0,
        });

        httpService    = { get: jest.fn() } as any;
        configService  = { get: jest.fn() } as any;

        configService.get.mockImplementation((key: string) => {
            if (key === 'gateway.url')     return 'http://gateway:3000';
            if (key === 'gateway.m2mToken') return 'm2m-token';
            return undefined;
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GatewayClient,
                { provide: HttpService,   useValue: httpService },
                { provide: ConfigService, useValue: configService },
            ],
        }).compile();

        client = module.get<GatewayClient>(GatewayClient);
    });

    afterEach(() => jest.clearAllMocks());

    describe('constructor', () => {
        it('should read gateway URL and M2M token from config', () => {
            expect(configService.get).toHaveBeenCalledWith('gateway.url');
            expect(configService.get).toHaveBeenCalledWith('gateway.m2mToken');
        });

        it('should use default URL when config is missing', async () => {
            configService.get.mockReturnValue(undefined);

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    GatewayClient,
                    { provide: HttpService,   useValue: httpService },
                    { provide: ConfigService, useValue: configService },
                ],
            }).compile();

            expect(module.get<GatewayClient>(GatewayClient)).toBeDefined();
        });
    });

    describe('getRequestByNumber', () => {
        it('should resolve with data returned by the circuit breaker', async () => {
            const mockData = { id: '123', number: 'REQ0001234' };
            mockBreaker.execute.mockResolvedValue(mockData);

            const result = await client.getRequestByNumber('REQ0001234');

            expect(mockBreaker.execute).toHaveBeenCalled();
            expect(result).toEqual(mockData);
        });

        it('should encode special characters in the number and call _httpGet', async () => {
            httpService.get.mockReturnValue(of(mockAxiosResponse({ id: '1' })));
            mockBreaker.execute.mockImplementation(async (task: any) => task());

            await client.getRequestByNumber('REQ#123');

            expect(httpService.get).toHaveBeenCalledWith(
                expect.stringContaining(encodeURIComponent('REQ#123')),
                expect.any(Object),
            );
        });

        it('should throw ServiceUnavailableException when circuit is open', async () => {
            mockBreaker.execute.mockImplementation(async (_task: any, fallback: any) =>
                fallback(new CircuitBreakerOpenError('api-gateway')),
            );

            await expect(client.getRequestByNumber('REQ0001234')).rejects.toThrow(
                ServiceUnavailableException,
            );
        });

        it('should re-throw infrastructure errors without wrapping', async () => {
            const infra = new HttpException('Bad Gateway', 502);
            mockBreaker.execute.mockImplementation(async (_task: any, fallback: any) =>
                fallback(infra),
            );

            await expect(client.getRequestByNumber('REQ0001234')).rejects.toThrow(infra);
        });
    });

    describe('listRequests', () => {
        it('should resolve with data returned by the circuit breaker', async () => {
            const mockData = { data: [] };
            mockBreaker.execute.mockResolvedValue(mockData);

            const result = await client.listRequests({ status: 'CREATED' });

            expect(mockBreaker.execute).toHaveBeenCalled();
            expect(result).toEqual(mockData);
        });

        it('should pass params to _httpGet via execute', async () => {
            const params = { status: 'CREATED', page: '1', limit: '20' };
            httpService.get.mockReturnValue(of(mockAxiosResponse({ data: [] })));
            mockBreaker.execute.mockImplementation(async (task: any) => task());

            await client.listRequests(params);

            expect(httpService.get).toHaveBeenCalledWith(
                'http://gateway:3000/internal-api/requests',
                expect.objectContaining({ params }),
            );
        });

        it('should throw ServiceUnavailableException when circuit is open', async () => {
            mockBreaker.execute.mockImplementation(async (_task: any, fallback: any) =>
                fallback(new CircuitBreakerOpenError('api-gateway')),
            );

            await expect(client.listRequests({})).rejects.toThrow(ServiceUnavailableException);
        });
    });

    describe('_httpGet (internal)', () => {
        it('should make a GET request with correct headers and timeout', async () => {
            httpService.get.mockReturnValue(of(mockAxiosResponse({ data: 'ok' })));

            const result = await (client as any)._httpGet('http://gateway:3000/test', { param: 'value' });

            expect(httpService.get).toHaveBeenCalledWith(
                'http://gateway:3000/test',
                {
                    params:  { param: 'value' },
                    headers: { 'Authorization': 'Bearer m2m-token', 'Content-Type': 'application/json' },
                    timeout: 5000,
                },
            );
            expect(result).toEqual({ data: 'ok' });
        });

        it('should throw NotFoundException on 404', async () => {
            const error = new AxiosError();
            error.response = { status: 404, data: { message: 'Not found' } } as any;
            httpService.get.mockReturnValue(throwError(() => error));

            await expect((client as any)._httpGet('http://gateway:3000/test')).rejects.toThrow(NotFoundException);
        });

        it('should throw HttpException with upstream message on 4xx', async () => {
            const error = new AxiosError();
            error.response = { status: 400, data: { message: 'Invalid parameters' } } as any;
            httpService.get.mockReturnValue(throwError(() => error));

            try {
                await (client as any)._httpGet('http://gateway:3000/test');
            } catch (e: any) {
                expect(e.getStatus()).toBe(400);
                expect(e.message).toBe('Invalid parameters');
            }
        });

        it('should throw generic HttpException when upstream has no message', async () => {
            const error = new AxiosError();
            error.response = { status: 502, data: {} } as any;
            httpService.get.mockReturnValue(throwError(() => error));

            try {
                await (client as any)._httpGet('http://gateway:3000/test');
            } catch (e: any) {
                expect(e.getStatus()).toBe(502);
                expect(e.message).toBe('Error del api-gateway (502)');
            }
        });

        it('should re-throw non-Axios errors', async () => {
            httpService.get.mockReturnValue(throwError(() => new Error('Network error')));

            await expect((client as any)._httpGet('http://gateway:3000/test')).rejects.toThrow('Network error');
        });
    });

    describe('getStatus', () => {
        it('should return circuit breaker metrics and bulkhead status', () => {
            const status = client.getStatus();

            expect(status).toHaveProperty('circuitBreaker');
            expect(status).toHaveProperty('bulkhead');
            expect(status.circuitBreaker).toHaveProperty('state');
            expect(status.circuitBreaker).toHaveProperty('failureRate');
            expect(status.bulkhead).toHaveProperty('high');
            expect(status.bulkhead).toHaveProperty('low');
            expect(status.bulkhead.high).toHaveProperty('concurrency', 10);
            expect(status.bulkhead.low).toHaveProperty('concurrency', 5);
        });
    });
});
