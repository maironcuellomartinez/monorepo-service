import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClientsService } from '../src/clients/clients.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ExternalClientEntity } from '../src/clients/entities/external-client.entity';

jest.setTimeout(30000);

const basicAuth = (id: string, secret: string) =>
    'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');

describe('Auth Flow (e2e)', () => {
    let app: INestApplication;
    let clientsService: jest.Mocked<ClientsService>;
    let jwtService: JwtService;
    let configService: ConfigService;

    beforeAll(async () => {
        const dbHost = process.env.DB_HOST ?? 'localhost';
        const canConnect = await tryConnect(dbHost);
        if (!canConnect) {
            console.warn(`⚠ MySQL no disponible en ${dbHost} — saltando tests e2e`);
            return;
        }

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(ClientsService)
            .useValue({
                validateCredentials: jest.fn(),
                create:              jest.fn(),
                findAll:             jest.fn(),
                findOne:             jest.fn(),
                rotateSecret:        jest.fn(),
                deactivate:          jest.fn(),
                updateTokenExpiry:   jest.fn(),
                reactivate:          jest.fn(),
                remove:              jest.fn(),
            })
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({
            whitelist:            true,
            forbidNonWhitelisted: true,
            transform:            true,
        }));

        clientsService = app.get(ClientsService) as any;
        jwtService     = app.get(JwtService);
        configService  = app.get(ConfigService);

        await app.init();
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    const validClient: ExternalClientEntity = {
        clientId:              'mc_test_e2e',
        clientSecretHash:      '$2a$10$testhash',
        name:                  'E2E Test App',
        description:           'Created for e2e testing',
        tokenExpiresInSeconds: 3600,
        allowedScopes:         null,
        isActive:              true,
        createdAt:             new Date(),
        updatedAt:             new Date(),
    };

    describe('POST /oauth/token', () => {
        it('should return 200 and JWT for valid Basic Auth credentials', async () => {
            if (!app) return;

            clientsService.validateCredentials.mockResolvedValue(validClient);

            const res = await request(app.getHttpServer())
                .post('/oauth/token')
                .set('Authorization', basicAuth('mc_test_e2e', 'correct-secret'))
                .send({ grant_type: 'client_credentials' })
                .expect(200);

            expect(res.body).toHaveProperty('access_token');
            expect(res.body).toHaveProperty('refresh_token');
            expect(res.body).toHaveProperty('token_type', 'Bearer');
            expect(res.body).toHaveProperty('expires_in', 3600);
            expect(res.body).toHaveProperty('client_name', 'E2E Test App');

            const decoded = jwtService.verify(res.body.access_token);
            expect(decoded.sub).toBe('mc_test_e2e');
            expect(decoded.type).toBe('external_client');
        });

        it('should return 401 for invalid credentials', async () => {
            if (!app) return;
            clientsService.validateCredentials.mockResolvedValue(null);

            await request(app.getHttpServer())
                .post('/oauth/token')
                .set('Authorization', basicAuth('mc_invalid', 'wrong'))
                .send({ grant_type: 'client_credentials' })
                .expect(401);
        });

        it('should return 401 when Authorization header is missing', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({ grant_type: 'client_credentials' })
                .expect(401);
        });

        it('should return 401 when client_id does not start with mc_', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .set('Authorization', basicAuth('invalid_id', 'secret'))
                .send({ grant_type: 'client_credentials' })
                .expect(401);
        });

        it('should return 400 for missing grant_type', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .set('Authorization', basicAuth('mc_test_e2e', 'secret'))
                .send({})
                .expect(400);
        });

        it('should return 400 for invalid grant_type', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .set('Authorization', basicAuth('mc_test_e2e', 'secret'))
                .send({ grant_type: 'authorization_code' })
                .expect(400);
        });
    });

    describe('GET /v1/requests/:number (Bearer auth)', () => {
        let validToken: string;

        beforeAll(() => {
            if (!app) return;
            validToken = jwtService.sign({
                sub:        'mc_test_e2e',
                type:       'external_client',
                clientName: 'E2E Test App',
            }, { expiresIn: 3600 });
        });

        it('should pass auth guard and reach gateway (200 or 503)', async () => {
            if (!app) return;

            const res = await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${validToken}`);

            expect([200, 503, 502]).toContain(res.status);
        });

        it('should return 401 without token', async () => {
            if (!app) return;
            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .expect(401);
        });

        it('should return 401 for expired token', async () => {
            if (!app) return;

            const expired = jwtService.sign(
                { sub: 'mc_test', type: 'external_client' },
                { expiresIn: 1 },
            );
            await new Promise(r => setTimeout(r, 1100));

            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${expired}`)
                .expect(401);
        });

        it('should return 401 for malformed token', async () => {
            if (!app) return;
            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', 'Bearer not-a-jwt')
                .expect(401);
        });

        it('should return 401 when token type is not external_client', async () => {
            if (!app) return;

            const wrongType = jwtService.sign(
                { sub: 'svc', type: 'internal_service' },
                { expiresIn: 3600 },
            );
            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${wrongType}`)
                .expect(401);
        });
    });

    describe('GET /health/ping', () => {
        it('should return 200 without authentication', async () => {
            if (!app) return;
            const res = await request(app.getHttpServer())
                .get('/health/ping')
                .expect(200);

            expect(res.body).toHaveProperty('status', 'ok');
            expect(res.body).toHaveProperty('timestamp');
            expect(res.body).toHaveProperty('uptime');
        });
    });
});

async function tryConnect(host: string): Promise<boolean> {
    try {
        const net = await import('net');
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error',   () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.connect(3306, host);
        });
    } catch {
        return false;
    }
}
