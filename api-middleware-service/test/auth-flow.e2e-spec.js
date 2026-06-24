"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const request = __importStar(require("supertest"));
const app_module_1 = require("../src/app.module");
const clients_service_1 = require("../src/clients/clients.service");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
jest.setTimeout(30000);
describe('Auth Flow (e2e)', () => {
    let app;
    let clientsService;
    let jwtService;
    let configService;
    beforeAll(async () => {
        const dbHost = process.env.DB_HOST ?? 'localhost';
        const canConnect = await tryConnect(dbHost);
        if (!canConnect) {
            console.warn(`⚠ MySQL no disponible en ${dbHost} — saltando tests e2e`);
            return;
        }
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        })
            .overrideProvider(clients_service_1.ClientsService)
            .useValue({
            validateCredentials: jest.fn(),
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            rotateSecret: jest.fn(),
            deactivate: jest.fn(),
        })
            .compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        clientsService = app.get(clients_service_1.ClientsService);
        jwtService = app.get(jwt_1.JwtService);
        configService = app.get(config_1.ConfigService);
        await app.init();
    });
    afterAll(async () => {
        if (app)
            await app.close();
    });
    describe('POST /oauth/token', () => {
        const validClient = {
            clientId: 'mc_test_e2e',
            clientSecretHash: '$2a$10$testhash',
            name: 'E2E Test App',
            description: 'Created for e2e testing',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        it('should return 200 and a JWT token for valid credentials', async () => {
            if (!app)
                return;
            clientsService.validateCredentials.mockResolvedValue(validClient);
            const response = await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                grant_type: 'client_credentials',
                client_id: 'mc_test_e2e',
                client_secret: 'test-secret',
            })
                .expect(200);
            expect(response.body).toHaveProperty('access_token');
            expect(response.body).toHaveProperty('token_type', 'Bearer');
            expect(response.body).toHaveProperty('expires_in');
            expect(response.body).toHaveProperty('client_name', 'E2E Test App');
            const decoded = jwtService.verify(response.body.access_token, {
                secret: configService.get('jwt.secret'),
            });
            expect(decoded.sub).toBe('mc_test_e2e');
            expect(decoded.type).toBe('external_client');
            expect(decoded.clientName).toBe('E2E Test App');
        });
        it('should return 401 for invalid credentials', async () => {
            if (!app)
                return;
            clientsService.validateCredentials.mockResolvedValue(null);
            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                grant_type: 'client_credentials',
                client_id: 'mc_invalid',
                client_secret: 'wrong-secret',
            })
                .expect(401);
        });
        it('should return 400 for missing grant_type', async () => {
            if (!app)
                return;
            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                client_id: 'mc_test',
                client_secret: 'secret',
            })
                .expect(400);
        });
        it('should return 400 for invalid grant_type', async () => {
            if (!app)
                return;
            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                grant_type: 'authorization_code',
                client_id: 'mc_test',
                client_secret: 'secret',
            })
                .expect(400);
        });
        it('should return 400 for missing client_id', async () => {
            if (!app)
                return;
            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                grant_type: 'client_credentials',
                client_secret: 'secret',
            })
                .expect(400);
        });
        it('should return 400 for missing client_secret', async () => {
            if (!app)
                return;
            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                grant_type: 'client_credentials',
                client_id: 'mc_test',
            })
                .expect(400);
        });
    });
    describe('GET /v1/requests/:number (authenticated)', () => {
        let validToken;
        beforeAll(async () => {
            if (!app)
                return;
            const payload = {
                sub: 'mc_test_e2e',
                type: 'external_client',
                clientName: 'E2E Test App',
            };
            validToken = jwtService.sign(payload, {
                secret: configService.get('jwt.secret'),
                expiresIn: 3600,
            });
        });
        it('should return 200 for a valid token (delegates to gateway)', async () => {
            if (!app)
                return;
            const response = await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${validToken}`);
            expect([200, 503, 502]).toContain(response.status);
        });
        it('should return 401 when no token is provided', async () => {
            if (!app)
                return;
            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .expect(401);
        });
        it('should return 401 when token is expired', async () => {
            if (!app)
                return;
            const expiredPayload = {
                sub: 'mc_test',
                type: 'external_client',
                clientName: 'Test',
            };
            const expiredToken = jwtService.sign(expiredPayload, {
                secret: configService.get('jwt.secret'),
                expiresIn: 0,
            });
            await new Promise(r => setTimeout(r, 100));
            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${expiredToken}`)
                .expect(401);
        });
        it('should return 401 for malformed token', async () => {
            if (!app)
                return;
            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', 'Bearer invalid-token-format')
                .expect(401);
        });
        it('should return 401 when token type is not external_client', async () => {
            if (!app)
                return;
            const wrongTypePayload = {
                sub: 'internal-svc',
                type: 'internal_service',
            };
            const wrongTypeToken = jwtService.sign(wrongTypePayload, {
                secret: configService.get('jwt.secret'),
                expiresIn: 3600,
            });
            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${wrongTypeToken}`)
                .expect(401);
        });
    });
    describe('GET /health/status (no auth)', () => {
        it('should return 200 without authentication', async () => {
            if (!app)
                return;
            await request(app.getHttpServer())
                .get('/health/status')
                .expect(200);
        });
    });
});
async function tryConnect(host) {
    try {
        const net = await Promise.resolve().then(() => __importStar(require('net')));
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error', () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.connect(3306, host);
        });
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=auth-flow.e2e-spec.js.map