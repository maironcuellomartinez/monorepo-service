// test/incidents.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { APP_FILTER } from '@nestjs/core';

import { IncidentsController } from 'src/api-gateway/inbound/incidents/incidents.controller';
import { AllExceptionsFilter } from 'src/api-gateway/inbound/common/filters/http-exception.filter';
import { INCIDENT_SERVICE } from 'apps/monolith/src/core/ports/incoming/service-tokens';
import { IncidentStatus } from 'apps/monolith/src/core/domain/enums/incident-status.enum';
import { IncidentId, TechnicianId, CustomerId } from 'apps/monolith/src/shared/types/branded-ids';
import { Result } from '@app/result';

// ─── Mock del IncidentService ─────────────────────────────────────────────────

function makeIncidentDto(overrides?: Partial<Record<string, any>>) {
    return {
        id: 'inc-1',
        status: IncidentStatus.CREATED,
        customerId: 'cust-1',
        cornerId: 'corner-1',
        currentTechnicianId: null,
        scheduledRange: {
            start: '2026-03-09T09:00:00.000Z',
            end: '2026-03-09T09:30:00.000Z',
        },
        ...overrides,
    };
}

const mockIncidentService = {
    createIncident: jest.fn(),
    takeIncident: jest.fn(),
    releaseIncident: jest.fn(),
    changeStatus: jest.fn(),
    validateIncident: jest.fn(),
    reopenIncident: jest.fn(),
    getIncident: jest.fn(),
    getAvailableIncidents: jest.fn(),
    getTechnicianIncidents: jest.fn(),
    getIncidentsByDate: jest.fn(),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

async function buildApp(): Promise<INestApplication> {
    const module: TestingModule = await Test.createTestingModule({
        controllers: [IncidentsController],
        providers: [
            { provide: INCIDENT_SERVICE, useValue: mockIncidentService },
            { provide: APP_FILTER, useClass: AllExceptionsFilter },
        ],
    }).compile();

    const app = module.createNestApplication();
    await app.init();
    return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/incidents', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('201 — crea una incidencia', async () => {
        const dto = makeIncidentDto();
        mockIncidentService.createIncident.mockResolvedValue(Result.ok(dto));

        const body = {
            issueTypeId: 'issue-1',
            customerId: 'cust-1',
            cornerId: 'corner-1',
            slotIds: ['slot-1', 'slot-2'],
            startTime: '2026-03-09T09:00:00.000Z',
            endTime: '2026-03-09T09:30:00.000Z',
            origin: 'CUSTOMER_APP',
        };

        const res = await request(app.getHttpServer())
            .post('/api/incidents')
            .send(body)
            .expect(HttpStatus.CREATED);

        expect(res.body.status).toBe(IncidentStatus.CREATED);
        expect(mockIncidentService.createIncident).toHaveBeenCalledTimes(1);
    });

    it('409 — cuando el servicio retorna error', async () => {
        mockIncidentService.createIncident.mockResolvedValue(
            Result.err(Object.assign(new Error('Slot not available'), { code: 'SLOT_NOT_AVAILABLE' }))
        );

        await request(app.getHttpServer())
            .post('/api/incidents')
            .send({
                issueTypeId: 'issue-1', customerId: 'cust-1', cornerId: 'corner-1',
                slotIds: ['slot-1'], startTime: '2026-03-09T09:00:00.000Z',
                endTime: '2026-03-09T09:30:00.000Z', origin: 'CUSTOMER_APP',
            })
            .expect(HttpStatus.CONFLICT);
    });
});

describe('GET /api/incidents/available', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('200 — retorna todas las incidencias no terminales del pool', async () => {
        const pool = [
            makeIncidentDto({ status: IncidentStatus.CREATED }),
            makeIncidentDto({ id: 'inc-2', status: IncidentStatus.IN_PROGRESS, currentTechnicianId: 'tech-1' }),
            makeIncidentDto({ id: 'inc-3', status: IncidentStatus.PAUSED, currentTechnicianId: 'tech-2' }),
        ];
        mockIncidentService.getAvailableIncidents.mockResolvedValue(Result.ok(pool));

        const res = await request(app.getHttpServer())
            .get('/api/incidents/available?cornerId=corner-1')
            .expect(HttpStatus.OK);

        expect(res.body).toHaveLength(3);
        expect(res.body[1].status).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('200 — retorna array vacío si no hay incidencias', async () => {
        mockIncidentService.getAvailableIncidents.mockResolvedValue(Result.ok([]));

        const res = await request(app.getHttpServer())
            .get('/api/incidents/available?cornerId=corner-1')
            .expect(HttpStatus.OK);

        expect(res.body).toEqual([]);
    });
});

describe('GET /api/incidents/:id', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('200 — retorna la incidencia', async () => {
        mockIncidentService.getIncident.mockResolvedValue(Result.ok(makeIncidentDto()));

        const res = await request(app.getHttpServer())
            .get('/api/incidents/inc-1')
            .expect(HttpStatus.OK);

        expect(res.body.id).toBe('inc-1');
    });

    it('404 — cuando la incidencia no existe', async () => {
        mockIncidentService.getIncident.mockResolvedValue(
            Result.err(Object.assign(new Error('Not found'), { code: 'INCIDENT_NOT_FOUND' }))
        );

        await request(app.getHttpServer())
            .get('/api/incidents/inc-999')
            .expect(HttpStatus.NOT_FOUND);
    });
});

describe('PATCH /api/incidents/:id/take', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('200 — técnico toma la incidencia (estado no cambia)', async () => {
        const updated = makeIncidentDto({ status: IncidentStatus.IN_PROGRESS, currentTechnicianId: 'tech-1' });
        mockIncidentService.takeIncident.mockResolvedValue(Result.ok(updated));

        const res = await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/take')
            .send({ technicianId: 'tech-1' })
            .expect(HttpStatus.OK);

        expect(res.body.currentTechnicianId).toBe('tech-1');
        expect(res.body.status).toBe(IncidentStatus.IN_PROGRESS);
    });

    it('409 — si la incidencia está en estado terminal (CANCELED)', async () => {
        mockIncidentService.takeIncident.mockResolvedValue(
            Result.err(Object.assign(new Error('Not available'), { code: 'INCIDENT_NOT_AVAILABLE' }))
        );

        await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/take')
            .send({ technicianId: 'tech-1' })
            .expect(HttpStatus.CONFLICT);
    });
});

describe('PATCH /api/incidents/:id/status', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('200 — IN_PROGRESS → PAUSED', async () => {
        const updated = makeIncidentDto({ status: IncidentStatus.PAUSED });
        mockIncidentService.changeStatus.mockResolvedValue(Result.ok(updated));

        const res = await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/status')
            .send({ technicianId: 'tech-1', newStatus: 'PAUSED', comment: 'esperando repuesto' })
            .expect(HttpStatus.OK);

        expect(res.body.status).toBe(IncidentStatus.PAUSED);
    });

    it('409 — transición inválida', async () => {
        mockIncidentService.changeStatus.mockResolvedValue(
            Result.err(Object.assign(new Error('Invalid transition'), { code: 'INVALID_INCIDENT_STATE' }))
        );

        await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/status')
            .send({ technicianId: 'tech-1', newStatus: 'CREATED' })
            .expect(HttpStatus.CONFLICT);
    });
});

describe('PATCH /api/incidents/:id/validate', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('200 — usuario valida la solución → VALIDATED', async () => {
        const updated = makeIncidentDto({ status: IncidentStatus.VALIDATED });
        mockIncidentService.validateIncident.mockResolvedValue(Result.ok(updated));

        const res = await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/validate')
            .send({ customerId: 'cust-1' })
            .expect(HttpStatus.OK);

        expect(res.body.status).toBe(IncidentStatus.VALIDATED);
    });

    it('409 — si la incidencia no está en CLOSED', async () => {
        mockIncidentService.validateIncident.mockResolvedValue(
            Result.err(Object.assign(new Error('Must be CLOSED'), { code: 'INVALID_INCIDENT_STATE' }))
        );

        await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/validate')
            .send({ customerId: 'cust-1' })
            .expect(HttpStatus.CONFLICT);
    });
});

describe('PATCH /api/incidents/:id/reopen', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('200 — usuario rechaza la solución → REOPENED', async () => {
        const updated = makeIncidentDto({ status: IncidentStatus.REOPENED, currentTechnicianId: null });
        mockIncidentService.reopenIncident.mockResolvedValue(Result.ok(updated));

        const res = await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/reopen')
            .send({ customerId: 'cust-1', reason: 'sigue sin funcionar' })
            .expect(HttpStatus.OK);

        expect(res.body.status).toBe(IncidentStatus.REOPENED);
        expect(res.body.currentTechnicianId).toBeNull();
    });
});

describe('PATCH /api/incidents/:id/release', () => {
    let app: INestApplication;

    beforeAll(async () => { app = await buildApp(); });
    afterAll(async () => { await app.close(); });
    beforeEach(() => jest.clearAllMocks());

    it('200 — libera la incidencia (sin técnico, mismo estado)', async () => {
        const updated = makeIncidentDto({ status: IncidentStatus.IN_PROGRESS, currentTechnicianId: null });
        mockIncidentService.releaseIncident.mockResolvedValue(Result.ok(updated));

        const res = await request(app.getHttpServer())
            .patch('/api/incidents/inc-1/release')
            .send({ technicianId: 'tech-1', reason: 'cambio de turno' })
            .expect(HttpStatus.OK);

        expect(res.body.currentTechnicianId).toBeNull();
        expect(res.body.status).toBe(IncidentStatus.IN_PROGRESS);
    });
});
