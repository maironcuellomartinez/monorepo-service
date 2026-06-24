import {
    Controller, Post, Body, HttpCode, HttpStatus,
    UseInterceptors, UnauthorizedException, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBasicAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { OAuthBulkheadInterceptor } from './interceptors/oauth-bulkhead.interceptor';

@ApiTags('Auth')
@Controller('oauth')
export class AuthController {
    constructor(private readonly service: AuthService) { }

    @Post('token')
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(OAuthBulkheadInterceptor)
    @ApiBasicAuth()
    @ApiOperation({ summary: 'Obtener access token (OAuth2 client_credentials)' })
    @ApiResponse({ status: 200, description: 'Token JWT emitido', type: TokenResponseDto })
    @ApiResponse({ status: 401, description: 'Credenciales invalidas' })
    @ApiResponse({ status: 429, description: 'Demasiados intentos — bulkhead saturado' })
    async issueToken(
        @Body() dto: TokenRequestDto,
        @Headers('authorization') authHeader?: string,
    ): Promise<TokenResponseDto> {
        const basic = this.extractBasicCredentials(authHeader);

        if (!basic) {
            throw new UnauthorizedException('Credenciales requeridas via Basic Auth');
        }

        if (!basic.client_id.startsWith('mc_')) {
            throw new UnauthorizedException('Formato de client_id invalido — debe comenzar con mc_');
        }

        return this.service.issueToken(basic.client_id, basic.client_secret, dto);
    }

    @Post('refresh')
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Renovar access token mediante refresh token' })
    @ApiResponse({ status: 200, description: 'Nuevo access token emitido', type: RefreshTokenResponseDto })
    @ApiResponse({ status: 401, description: 'Refresh token invalido o expirado' })
    @ApiResponse({ status: 429, description: 'Demasiados intentos' })
    async refreshToken(
        @Body() dto: RefreshTokenRequestDto,
    ): Promise<RefreshTokenResponseDto> {
        return this.service.refreshToken(dto);
    }

    /**
     * Obtiene las credenciales basicas del header de autorizacion
     * @param authHeader Header de autorizacion
     * @returns Credenciales basicas
     * @description Metodo auxiliar que permite obtener las credenciales basicas del header de autorizacion.
     */
    private extractBasicCredentials(authHeader?: string): { client_id: string; client_secret: string } | null {
        if (!authHeader) return null;

        const parts = authHeader.split(' ');
        const [scheme, credentials] = parts;
        if (!scheme || !credentials || scheme.toLowerCase() !== 'basic') {
            return null;
        }

        try {
            const decoded = Buffer.from(credentials, 'base64').toString('utf-8');
            const colonIndex = decoded.indexOf(':');
            if (colonIndex === -1) return null;

            const client_id = decoded.substring(0, colonIndex);
            const client_secret = decoded.substring(colonIndex + 1);

            if (!client_id || !client_secret) return null;

            return { client_id, client_secret };
        } catch {
            return null;
        }
    }
}
