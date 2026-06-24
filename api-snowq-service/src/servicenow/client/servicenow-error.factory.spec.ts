import { ServiceNowErrorFactory } from './servicenow-error.factory';
import { ServiceNowFatalError } from 'src/common/errors/if-faltal.error';
import { ServiceNowAuthError } from 'src/common/errors/servicenow-auth.error';
import { ServiceNowTemporalError } from 'src/common/errors/if-temporal.error';

describe('ServiceNowErrorFactory', () => {
    let factory: ServiceNowErrorFactory;

    beforeEach(() => {
        factory = new ServiceNowErrorFactory();
    });

    describe('Errores fatales (400, 404, 422)', () => {
        it('debería crear ServiceNowFatalError para status 400', () => {
            const error = factory.create(400, 'Bad Request', 'campo inválido');
            expect(error).toBeInstanceOf(ServiceNowFatalError);
            expect((error as ServiceNowFatalError).statusCode).toBe(400);
        });

        it('debería crear ServiceNowFatalError para status 404', () => {
            const error = factory.create(404, 'Not Found');
            expect(error).toBeInstanceOf(ServiceNowFatalError);
            expect((error as ServiceNowFatalError).statusCode).toBe(404);
        });

        it('debería crear ServiceNowFatalError para status 422', () => {
            const error = factory.create(422, 'Unprocessable Entity');
            expect(error).toBeInstanceOf(ServiceNowFatalError);
            expect((error as ServiceNowFatalError).statusCode).toBe(422);
        });
    });

    describe('Errores de autenticación (401, 403)', () => {
        it('debería crear ServiceNowAuthError para status 401', () => {
            const error = factory.create(401, 'Unauthorized');
            expect(error).toBeInstanceOf(ServiceNowAuthError);
            expect((error as ServiceNowAuthError).statusCode).toBe(401);
        });

        it('debería crear ServiceNowAuthError para status 403', () => {
            const error = factory.create(403, 'Forbidden');
            expect(error).toBeInstanceOf(ServiceNowAuthError);
            expect((error as ServiceNowAuthError).statusCode).toBe(403);
        });
    });

    describe('Errores temporales (408, 500, 502, 503, 504)', () => {
        it('debería crear ServiceNowTemporalError para status 408', () => {
            const error = factory.create(408, 'Request Timeout');
            expect(error).toBeInstanceOf(ServiceNowTemporalError);
            expect((error as ServiceNowTemporalError).statusCode).toBe(408);
        });

        it('debería crear ServiceNowTemporalError para status 500', () => {
            const error = factory.create(500, 'Internal Server Error');
            expect(error).toBeInstanceOf(ServiceNowTemporalError);
            expect((error as ServiceNowTemporalError).statusCode).toBe(500);
        });

        it('debería crear ServiceNowTemporalError para status 502', () => {
            const error = factory.create(502, 'Bad Gateway');
            expect(error).toBeInstanceOf(ServiceNowTemporalError);
            expect((error as ServiceNowTemporalError).statusCode).toBe(502);
        });

        it('debería crear ServiceNowTemporalError para status 503', () => {
            const error = factory.create(503, 'Service Unavailable');
            expect(error).toBeInstanceOf(ServiceNowTemporalError);
            expect((error as ServiceNowTemporalError).statusCode).toBe(503);
        });

        it('debería crear ServiceNowTemporalError para status 504', () => {
            const error = factory.create(504, 'Gateway Timeout');
            expect(error).toBeInstanceOf(ServiceNowTemporalError);
            expect((error as ServiceNowTemporalError).statusCode).toBe(504);
        });
    });

    describe('Status desconocido — fallback fatal', () => {
        it('debería crear ServiceNowFatalError para status 999 (desconocido)', () => {
            const error = factory.create(999, 'Unknown Error');
            expect(error).toBeInstanceOf(ServiceNowFatalError);
            expect((error as ServiceNowFatalError).statusCode).toBe(999);
        });
    });

    describe('Propiedades del error', () => {
        it('debería incluir el mensaje en el error fatal', () => {
            const error = factory.create(400, 'mensaje del error');
            expect(error.message).toBe('mensaje del error');
        });

        it('debería incluir errorMessage personalizado cuando se proporciona', () => {
            const error = factory.create(500, 'error interno', 'detalle del error');
            expect((error as ServiceNowTemporalError).errorMessage).toBe('detalle del error');
        });

        it('debería usar errorMessage por defecto cuando no se proporciona', () => {
            const error = factory.create(500, 'error interno');
            expect((error as ServiceNowTemporalError).errorMessage).toBeTruthy();
        });
    });
});
