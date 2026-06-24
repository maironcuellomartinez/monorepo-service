import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { OAuthBulkheadInterceptor } from './interceptors/oauth-bulkhead.interceptor';

describe('AuthController', () => {
    let controller: AuthController;
    let authService: jest.Mocked<AuthService>;

    const mockTokenResponse: TokenResponseDto = {
        access_token: 'jwt.token.here',
        refresh_token: 'refresh.jwt.here',
        token_type:   'Bearer',
        expires_in:   3600,
        client_name:  'Test App',
    };

    const mockRefreshResponse: RefreshTokenResponseDto = {
        access_token:  'new.jwt.token',
        refresh_token: 'new.refresh.jwt',
        token_type:    'Bearer',
        expires_in:    3600,
        client_name:   'Test App',
    };

    beforeEach(async () => {
        authService = {
            issueToken:   jest.fn().mockResolvedValue(mockTokenResponse),
            refreshToken: jest.fn().mockResolvedValue(mockRefreshResponse),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                { provide: AuthService, useValue: authService },
            ],
        })
            .overrideInterceptor(OAuthBulkheadInterceptor)
            .useValue({ intercept: (_ctx: any, next: any) => next.handle() })
            .compile();

        controller = module.get<AuthController>(AuthController);
    });

    describe('issueToken — Basic Auth', () => {
        it('should extract credentials from Basic Auth header and delegate to service', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('mc_abc123:supersecret').toString('base64');

            const result = await controller.issueToken(
                dto,
                `Basic ${encoded}`,
            );

            expect(authService.issueToken).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
                dto,
            );
            expect(result).toEqual(mockTokenResponse);
        });

        it('should pass scope from body to service', async () => {
            const dto: TokenRequestDto = {
                grant_type: 'client_credentials',
                scope:      'read write admin',
            };
            const encoded = Buffer.from('mc_abc123:supersecret').toString('base64');

            await controller.issueToken(dto, `Basic ${encoded}`);

            expect(authService.issueToken).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
                expect.objectContaining({ scope: 'read write admin' }),
            );
        });

        it('should throw UnauthorizedException when Basic Auth header is malformed', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };

            await expect(
                controller.issueToken(dto, 'Basic not-base64!!!'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when Basic Auth header has no colon separator', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('invalid-no-colon').toString('base64');

            await expect(
                controller.issueToken(dto, `Basic ${encoded}`),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when no credentials provided at all', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };

            await expect(
                controller.issueToken(dto),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when Basic Auth header is not Basic scheme', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };

            await expect(
                controller.issueToken(dto, 'Bearer some-token'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should handle Basic Auth with empty password after colon', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('mc_abc123:').toString('base64');

            await expect(
                controller.issueToken(dto, `Basic ${encoded}`),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should handle Basic Auth with empty client_id before colon', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from(':supersecret').toString('base64');

            await expect(
                controller.issueToken(dto, `Basic ${encoded}`),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when client_id does not start with mc_', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('invalid_client:supersecret').toString('base64');

            await expect(
                controller.issueToken(dto, `Basic ${encoded}`),
            ).rejects.toThrow(
                new UnauthorizedException('Formato de client_id invalido — debe comenzar con mc_'),
            );
        });
    });

    describe('refreshToken — POST /oauth/refresh', () => {
        it('should delegate to authService.refreshToken and return response', async () => {
            const dto: RefreshTokenRequestDto = {
                refresh_token: 'valid.refresh.jwt',
            };

            const result = await controller.refreshToken(dto);

            expect(authService.refreshToken).toHaveBeenCalledWith(dto);
            expect(result).toEqual(mockRefreshResponse);
        });

        it('should propagate UnauthorizedException from service', async () => {
            const dto: RefreshTokenRequestDto = {
                refresh_token: 'invalid.refresh.jwt',
            };
            authService.refreshToken.mockRejectedValue(
                new UnauthorizedException('Refresh token invalido o expirado'),
            );

            await expect(controller.refreshToken(dto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should accept refresh token and return new token pair', async () => {
            const dto: RefreshTokenRequestDto = {
                refresh_token: 'another.valid.jwt',
            };
            const customResponse: RefreshTokenResponseDto = {
                access_token:  'custom.access.jwt',
                refresh_token: 'custom.refresh.jwt',
                token_type:    'Bearer',
                expires_in:    7200,
                client_name:   'My App',
            };
            authService.refreshToken.mockResolvedValue(customResponse);

            const result = await controller.refreshToken(dto);

            expect(result.access_token).toBe('custom.access.jwt');
            expect(result.refresh_token).toBe('custom.refresh.jwt');
            expect(result.expires_in).toBe(7200);
        });
    });
});
