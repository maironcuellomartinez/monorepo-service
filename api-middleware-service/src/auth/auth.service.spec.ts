import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { TokenRequestDto } from './dto/token-request.dto';
import { RefreshTokenRequestDto } from './dto/refresh-token.dto';
import { ExternalClientEntity } from '../clients/entities/external-client.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

// Mock bcrypt.compare para los tests de refreshToken
jest.mock('bcrypt', () => ({
    ...jest.requireActual('bcrypt'),
    compare: jest.fn(),
    hash: jest.fn(),
}));

describe('AuthService', () => {
    let service: AuthService;
    let clientsService: jest.Mocked<ClientsService>;
    let jwtService: jest.Mocked<JwtService>;
    let configService: jest.Mocked<ConfigService>;
    let refreshRepo: jest.Mocked<Repository<RefreshTokenEntity>>;

    const mockClient: ExternalClientEntity = {
        clientId:               'mc_abc123',
        clientSecretHash:       '$2a$10$hash',
        name:                   'Test App',
        description:            'A test application',
        tokenExpiresInSeconds:  3600,
        allowedScopes:          null,
        isActive:               true,
        createdAt:              new Date('2025-01-01'),
        updatedAt:              new Date('2025-01-01'),
    };

    const clientId = 'mc_abc123';
    const clientSecret = 'supersecret';

    const validDto: TokenRequestDto = {
        grant_type: 'client_credentials',
    };

    beforeEach(async () => {
        clientsService = {
            validateCredentials: jest.fn(),
            create:              jest.fn(),
            findAll:             jest.fn(),
            findOne:             jest.fn(),
            rotateSecret:        jest.fn(),
            deactivate:          jest.fn(),
        } as any;

        jwtService = {
            sign:   jest.fn(),
            verify: jest.fn(),
        } as any;

        configService = {
            get: jest.fn(),
        } as any;

        refreshRepo = {
            create:  jest.fn(),
            save:    jest.fn(),
            findOne: jest.fn(),
            update:  jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: ClientsService, useValue: clientsService },
                { provide: JwtService,     useValue: jwtService },
                { provide: ConfigService,  useValue: configService },
                { provide: getRepositoryToken(RefreshTokenEntity), useValue: refreshRepo },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);

        // Reset mocks globales de bcrypt
        (bcrypt.compare as jest.Mock).mockReset();
        (bcrypt.hash as jest.Mock).mockReset();
    });

    describe('issueToken', () => {
        beforeEach(() => {
            (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$refreshtokenhash');
            refreshRepo.create.mockReturnValue({} as RefreshTokenEntity);
            refreshRepo.save.mockResolvedValue({} as RefreshTokenEntity);
        });

        it('should return a valid TokenResponseDto when credentials are correct', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(clientsService.validateCredentials).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
            );
            expect(jwtService.sign).toHaveBeenNthCalledWith(
                1,
                {
                    sub:        'mc_abc123',
                    type:       'external_client',
                    clientName: 'Test App',
                },
                { expiresIn: 3600 },
            );
            expect(result).toEqual({
                access_token:  'jwt.token.here',
                refresh_token: 'jwt.token.here',
                token_type:    'Bearer',
                expires_in:    3600,
                client_name:   'Test App',
            });
        });

        it('should throw UnauthorizedException when credentials are invalid', async () => {
            clientsService.validateCredentials.mockResolvedValue(null);

            await expect(service.issueToken(clientId, clientSecret, validDto)).rejects.toThrow(
                UnauthorizedException,
            );
            expect(clientsService.validateCredentials).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
            );
        });

        it('should throw UnauthorizedException when client is inactive', async () => {
            clientsService.validateCredentials.mockResolvedValue(null);

            await expect(service.issueToken(clientId, clientSecret, validDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should use default expiration when client has no tokenExpiresInSeconds', async () => {
            const clientWithoutExp = { ...mockClient, tokenExpiresInSeconds: undefined as any };
            clientsService.validateCredentials.mockResolvedValue(clientWithoutExp);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.any(Object),
                { expiresIn: 3600 },
            );
            expect(result.expires_in).toBe(3600);
        });

        it('should use client-specific tokenExpiresInSeconds', async () => {
            const clientCustomExp = { ...mockClient, tokenExpiresInSeconds: 7200 };
            clientsService.validateCredentials.mockResolvedValue(clientCustomExp);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.any(Object),
                { expiresIn: 7200 },
            );
            expect(result.expires_in).toBe(7200);
        });

        it('should clamp tokenExpiresInSeconds to minimum 3600', async () => {
            const clientLowExp = { ...mockClient, tokenExpiresInSeconds: 60 };
            clientsService.validateCredentials.mockResolvedValue(clientLowExp);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.any(Object),
                { expiresIn: 3600 },
            );
            expect(result.expires_in).toBe(3600);
        });

        it('should clamp tokenExpiresInSeconds to maximum 604800', async () => {
            const clientHighExp = { ...mockClient, tokenExpiresInSeconds: 999999 };
            clientsService.validateCredentials.mockResolvedValue(clientHighExp);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.any(Object),
                { expiresIn: 604800 },
            );
            expect(result.expires_in).toBe(604800);
        });

        it('should include client name in JWT payload', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({ clientName: 'Test App' }),
                expect.any(Object),
            );
        });

        it('should include clientId as sub in JWT payload', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({ sub: 'mc_abc123' }),
                expect.any(Object),
            );
        });

        it('should parse scope string into array in JWT payload and response', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const dtoWithScope: TokenRequestDto = {
                grant_type: 'client_credentials',
                scope:      'read write admin',
            };

            const result = await service.issueToken(clientId, clientSecret, dtoWithScope);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: ['read', 'write', 'admin'],
                }),
                expect.any(Object),
            );
            expect(result.scope).toEqual(['read', 'write', 'admin']);
        });

        it('should handle scope with multiple consecutive spaces', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const dtoWithScope: TokenRequestDto = {
                grant_type: 'client_credentials',
                scope:      'read   write    admin',
            };

            const result = await service.issueToken(clientId, clientSecret, dtoWithScope);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: ['read', 'write', 'admin'],
                }),
                expect.any(Object),
            );
            expect(result.scope).toEqual(['read', 'write', 'admin']);
        });

        it('should omit scope from payload and response when scope is not provided', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.not.objectContaining({ scope: expect.anything() }),
                expect.any(Object),
            );
            expect(result.scope).toBeUndefined();
        });

        it('should emit a refresh token alongside the access token', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            // Debe llamar a jwt.sign dos veces: una para access token, otra para refresh token
            expect(jwtService.sign).toHaveBeenCalledTimes(2);
            expect(jwtService.sign).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    sub:  'mc_abc123',
                    type: 'refresh_token',
                    jti:  expect.any(String),
                }),
                { expiresIn: 604800 },
            );
            expect(result.refresh_token).toBe('jwt.token.here');
        });

        it('should store refresh token hash in database', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            jwtService.sign.mockReturnValue('jwt.token.here');

            await service.issueToken(clientId, clientSecret, validDto);

            expect(refreshRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    clientId:  'mc_abc123',
                    tokenHash: expect.any(String),
                    jtiHash:   expect.any(String),
                    expiresAt: expect.any(Date),
                }),
            );
            expect(refreshRepo.save).toHaveBeenCalled();
        });
    });

    describe('refreshToken', () => {
        const validRefreshDto: RefreshTokenRequestDto = {
            refresh_token: 'valid.jwt.refresh',
        };

        const mockPayload = {
            sub:  'mc_abc123',
            type: 'refresh_token',
            jti:  'uuid-jti',
        };

        const mockStoredToken: RefreshTokenEntity = {
            id:            1,
            clientId:      'mc_abc123',
            tokenHash:     '$2a$10$storedhash',
            jtiHash:       'sha256-of-uuid-jti',
            expiresAt:     new Date(Date.now() + 3600 * 1000),
            revokedAt:     null,
            createdAt:     new Date(),
            grantedScopes: null,
        };

        beforeEach(() => {
            (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$newrefreshtokenhash');
            refreshRepo.create.mockReturnValue({} as RefreshTokenEntity);
            refreshRepo.save.mockResolvedValue({} as RefreshTokenEntity);
        });

        it('should return a new token pair when refresh token is valid', async () => {
            jwtService.verify.mockReturnValue(mockPayload);
            refreshRepo.findOne.mockResolvedValue(mockStoredToken);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            clientsService.findOne.mockResolvedValue({
                clientId: 'mc_abc123',
                name: 'Test App',
                description: 'A test application',
                isActive: true,
                tokenExpiresInSeconds: 3600,
                allowedScopes: null,
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-01'),
            });
            jwtService.sign.mockReturnValue('new.jwt.token');

            const result = await service.refreshToken(validRefreshDto);

            expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.refresh');
            expect(refreshRepo.findOne).toHaveBeenCalledWith({
                where: { clientId: 'mc_abc123', jtiHash: expect.any(String), revokedAt: expect.any(Object) },
            });
            expect(bcrypt.compare).toHaveBeenCalledWith('uuid-jti', '$2a$10$storedhash');
            expect(result).toEqual({
                access_token:  'new.jwt.token',
                refresh_token: 'new.jwt.token',
                token_type:    'Bearer',
                expires_in:    3600,
                client_name:   'Test App',
            });
        });

        it('should throw UnauthorizedException when JWT verification fails', async () => {
            jwtService.verify.mockImplementation(() => { throw new Error('jwt malformed'); });

            await expect(service.refreshToken(validRefreshDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException when payload type is not refresh_token', async () => {
            jwtService.verify.mockReturnValue({ ...mockPayload, type: 'access_token' });

            await expect(service.refreshToken(validRefreshDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException when payload has no sub', async () => {
            jwtService.verify.mockReturnValue({ ...mockPayload, sub: undefined });

            await expect(service.refreshToken(validRefreshDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException when payload has no jti', async () => {
            jwtService.verify.mockReturnValue({ ...mockPayload, jti: undefined });

            await expect(service.refreshToken(validRefreshDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException when stored token is not found', async () => {
            jwtService.verify.mockReturnValue(mockPayload);
            refreshRepo.findOne.mockResolvedValue(null);

            await expect(service.refreshToken(validRefreshDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException and revoke all tokens on hash mismatch (reuse attack)', async () => {
            jwtService.verify.mockReturnValue(mockPayload);
            refreshRepo.findOne.mockResolvedValue(mockStoredToken);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.refreshToken(validRefreshDto)).rejects.toThrow(
                UnauthorizedException,
            );

            // Debe revocar todos los tokens del cliente
            expect(refreshRepo.update).toHaveBeenCalledWith(
                { clientId: 'mc_abc123', revokedAt: expect.any(Object) },
                { revokedAt: expect.any(Date) },
            );
        });

        it('should throw UnauthorizedException when stored token is expired', async () => {
            const expiredToken = {
                ...mockStoredToken,
                expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hora en el pasado
            };
            jwtService.verify.mockReturnValue(mockPayload);
            refreshRepo.findOne.mockResolvedValue(expiredToken);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            await expect(service.refreshToken(validRefreshDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should revoke the old refresh token after successful rotation', async () => {
            jwtService.verify.mockReturnValue(mockPayload);
            refreshRepo.findOne.mockResolvedValue(mockStoredToken);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            clientsService.findOne.mockResolvedValue({
                clientId: 'mc_abc123',
                name: 'Test App',
                description: 'A test application',
                isActive: true,
                tokenExpiresInSeconds: 3600,
                allowedScopes: null,
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-01'),
            });
            jwtService.sign.mockReturnValue('new.jwt.token');

            await service.refreshToken(validRefreshDto);

            // El token almacenado debe tener revokedAt seteado
            expect(mockStoredToken.revokedAt).toBeInstanceOf(Date);
            expect(refreshRepo.save).toHaveBeenCalledWith(mockStoredToken);
        });

        it('should use client-specific tokenExpiresInSeconds for new access token', async () => {
            jwtService.verify.mockReturnValue(mockPayload);
            refreshRepo.findOne.mockResolvedValue(mockStoredToken);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            clientsService.findOne.mockResolvedValue({
                clientId: 'mc_abc123',
                name: 'Test App',
                description: 'A test application',
                isActive: true,
                tokenExpiresInSeconds: 7200,
                allowedScopes: null,
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-01'),
            });
            jwtService.sign.mockReturnValue('new.jwt.token');

            const result = await service.refreshToken(validRefreshDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.any(Object),
                { expiresIn: 7200 },
            );
            expect(result.expires_in).toBe(7200);
        });
    });
});
