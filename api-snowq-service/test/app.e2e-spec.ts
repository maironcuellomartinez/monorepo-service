import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live responde 200 sin auth', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('alive');
        expect(typeof res.body.uptime).toBe('number');
      });
  });

  it('GET /health/ready responde 200 sin auth', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ready');
      });
  });

  it('GET /health/status sin token → 401 (protegido con M2mJwtGuard)', () => {
    return request(app.getHttpServer()).get('/health/status').expect(401);
  });

  it('GET /snow-requests/all sin token → 401 (protegido con M2mJwtGuard)', () => {
    return request(app.getHttpServer()).get('/snow-requests/all').expect(401);
  });

  it('POST /monitoring/alerts con payload minimo → no exige auth (Thruk no manda JWT)', () => {
    return request(app.getHttpServer())
      .post('/monitoring/alerts')
      .send({
        notificationType: 'ACKNOWLEDGEMENT',
        host: 'e2e-test-host',
        service: 'HTTP',
        state: 'CRITICAL',
        stateType: 'HARD',
        checkAttempt: 1,
        maxCheckAttempts: 3,
        output: 'e2e smoke test',
      })
      .expect(200)
      .expect((res) => {
        // ACKNOWLEDGEMENT siempre se ignora — no crea ticket ni exige auth.
        expect(res.body.action).toBe('IGNORED');
      });
  });
});
