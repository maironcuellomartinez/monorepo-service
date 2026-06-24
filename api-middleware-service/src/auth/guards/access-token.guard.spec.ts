import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccessTokenGuard } from './access-token.guard';

describe('AccessTokenGuard', () => {
    let guard: AccessTokenGuard;
    let jwtService: jest.Mocked<JwtService>;
    let configService: jest.Mocked<ConfigService>;

    const mockRequest = (authorization?: string) =>
        ({
            headers: { authorization },
        }) as any;

    const mockExecutionContext = (request: any) =>
        ({
            switchToHttp: () => ({
                getRequest: () => request,
            }),
        }) as any;

    beforeEach(async () => {
        jwtService = {
            sign:   jest.fn(),
            verify: jest.fn(),
        } as any;

        configService = {
            get: jest.fn().mockReturnValue('my-secret'),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AccessTokenGuard,
                { provide: JwtService,   useValue: jwtService },
                { provide: ConfigService, useValue: configService },
            ],
        }).compile();

        guard = module.get<AccessTokenGuard>(AccessTokenGuard);
    });

    describe('canActivate', () => {
        it('should return true for a valid Bearer token with external_client type', () => {
            const request = mockRequest('Bearer valid.jwt.token');
            const context = mockExecutionContext(request);

            jwtService.verify.mockReturnValue({
                sub:        'mc_abc123',
                type:       'external_client',
                clientName: 'Test App',
            });

            const result = guard.canActivate(context);

            expect(result).toBe(true);
            expect((request as any).externalClient).toEqual({
                clientId:   'mc_abc123',
                clientName: 'Test App',
            });
            expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.token', {
                secret: 'my-secret',
            });
        });

        it('should throw UnauthorizedException when Authorization header is missing', () => {
            const request = mockRequest(undefined);
            const context = mockExecutionContext(request);

            expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
            expect(() => guard.canActivate(context)).toThrow('Se requiere access_token');
        });

        it('should throw UnauthorizedException when Authorization header is not Bearer', () => {
            const request = mockRequest('Basic somehash');
            const context = mockExecutionContext(request);

            expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
            expect(() => guard.canActivate(context)).toThrow('Se requiere access_token');
        });

        it('should throw UnauthorizedException when token is invalid', () => {
            const request = mockRequest('Bearer invalid.token');
            const context = mockExecutionContext(request);

            jwtService.verify.mockImplementation(() => {
                throw new Error('jwt malformed');
            });

            expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
            expect(() => guard.canActivate(context)).toThrow('Token inválido o expirado');
        });

        it('should throw UnauthorizedException when token is expired', () => {
            const request = mockRequest('Bearer expired.token');
            const context = mockExecutionContext(request);

            jwtService.verify.mockImplementation(() => {
                const err: any = new Error('jwt expired');
                err.name = 'TokenExpiredError';
                throw err;
            });

            expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
            expect(() => guard.canActivate(context)).toThrow('Token inválido o expirado');
        });

        it('should throw UnauthorizedException when token type is not external_client', () => {
            const request = mockRequest('Bearer valid.jwt.token');
            const context = mockExecutionContext(request);

            jwtService.verify.mockReturnValue({
                sub:  'mc_abc123',
                type: 'internal_service',
            });

            expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
            expect(() => guard.canActivate(context)).toThrow(
                'Token no pertenece a una aplicación externa',
            );
        });

        it('should re-throw UnauthorizedException directly without wrapping', () => {
            const request = mockRequest('Bearer some.token');
            const context = mockExecutionContext(request);

            jwtService.verify.mockImplementation(() => {
                throw new UnauthorizedException('Custom unauthorized');
            });

            expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
            // Should not wrap in "Token inválido o expirado"
            try {
                guard.canActivate(context);
            } catch (e: any) {
                expect(e.message).toBe('Custom unauthorized');
            }
        });

        it('should use config secret for verification', () => {
            const request = mockRequest('Bearer token');
            const context = mockExecutionContext(request);

            jwtService.verify.mockReturnValue({
                sub:  'mc_abc123',
                type: 'external_client',
            });

            guard.canActivate(context);

            expect(configService.get).toHaveBeenCalledWith('jwt.secret');
        });
    });
});
