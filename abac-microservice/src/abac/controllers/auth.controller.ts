import { Controller, Post, Body, Get, HttpCode, UnauthorizedException, BadRequestException, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { AdminLoginDto, ServiceTokenDto, OAuthTokenDto, ValidateEntraTokenDto, SimulateEntraDto } from '../dtos/auth.dto';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { JwtEd25519Service } from '../../common/crypto/jwt-ed25519.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('admin/login')
    @HttpCode(200)
    @ApiOperation({ summary: 'Login de administrador (email + password → JWT)' })
    async adminLogin(@Body() body: AdminLoginDto) {
        const result = await this.authService.adminLogin(body.email, body.password, body.applicationId);
        if (result.isFailure) {
            throw new UnauthorizedException(result.unwrapError());
        }
        return result.unwrap();
    }

    @Post('service-token')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Token de corta duración para integraciones ad-hoc (1h)',
        description:
            'Intercambia apiKey + apiSecret por un JWT válido 1 hora. ' +
            'Diseñado para integraciones externas puntuales (type=internal). ' +
            'Los servicios de infraestructura deben usar POST /applications/:id/token ' +
            'para obtener tokens de larga duración (tokenDurationDays).',
    })
    async serviceToken(@Body() body: ServiceTokenDto) {
        const result = await this.authService.generateServiceToken(body.apiKey, body.apiSecret);
        if (result.isFailure) {
            throw new UnauthorizedException(result.unwrapError());
        }
        return result.unwrap();
    }

    @Post('validate-api-key')
    @UseGuards(ApiKeyGuard)
    @ApiOperation({ summary: 'Validar API Key y Secret — requiere x-api-key del servicio caller' })
    @ApiHeader({ name: 'x-api-key', description: 'API Key del servicio caller', required: true })
    async validateApiKey(
        @Body() dto: { apiKey: string; apiSecret: string }
    ) {
        return this.authService.validateApiKey(dto.apiKey, dto.apiSecret);
    }

    @Post('validate-token')
    @UseGuards(ApiKeyGuard)
    @ApiOperation({ summary: 'Validar JWT Token — requiere x-api-key del servicio caller' })
    @ApiHeader({ name: 'x-api-key', description: 'API Key del servicio caller', required: true })
    async validateToken(
        @Body() dto: { token: string }
    ) {
        try {
            return await this.authService.validateToken(dto.token);
        } catch (error) {
            throw new UnauthorizedException('Token inválido');
        }
    }

    @Post('oauth/token')
    @HttpCode(200)
    @ApiOperation({ summary: 'OAuth 2.0 Client Credentials (RFC 6749) — para apps externas' })
    async oauthToken(@Body() body: OAuthTokenDto) {
        if (body.grant_type !== 'client_credentials') {
            throw new BadRequestException({
                error: 'unsupported_grant_type',
                error_description: `grant_type '${body.grant_type}' no soportado. Use 'client_credentials'.`,
            });
        }

        const result = await this.authService.generateOAuthToken(
            body.client_id,
            body.client_secret,
            body.scope,
        );

        if (result.isFailure) {
            const err = result.unwrapError();
            const isScope = err === 'invalid_scope';
            throw new UnauthorizedException({
                error: isScope ? 'invalid_scope' : 'invalid_client',
                error_description: isScope
                    ? 'Uno o más scopes solicitados no están permitidos para este cliente'
                    : 'Credenciales de cliente inválidas o tipo de aplicación incorrecto',
            });
        }

        return result.unwrap();
    }

    @Post('validate-entra')
    @HttpCode(200)
    @UseGuards(ApiKeyGuard)
    @ApiOperation({ summary: 'Validar token de Entra ID (Azure AD) y sincronizar usuario — solo servicios de confianza' })
    @ApiHeader({ name: 'x-api-key', description: 'API Key del servicio caller', required: true })
    async validateEntra(@Body() body: ValidateEntraTokenDto) {
        return this.authService.validateEntraToken(body.token, body.applicationId);
    }

    /**
     * Primero necesitas un JWT admin. Luego usas el endpoint dev de simulación:

  Paso 1 — obtener token admin:
  curl -s -X POST http://localhost:3005/auth/admin/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@abac.internal","password":"<tu-password>"}' \
    | jq '.token'

  Paso 2 — simular login de Entra ID (crea/vincula el usuario en ABAC):
  curl -X POST http://localhost:3005/auth/dev/simulate-entra \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <TOKEN_DEL_PASO_1>" \
    -d '{
      "oid": "oid-azure-abc-123",
      "email": "usuario@tuempresa.com",
      "name": "Nombre Apellido",
      "applicationId": "<id-de-la-app-abac>"
    }'

  La respuesta devuelve userId (el ID interno en ABAC) y los permissions resueltos para esa app. Si el usuario ya existe con ese oid,
   hace upsert — actualiza datos sin duplicar. Si el oid no existía, crea el usuario con accountType: 'user' y lo vincula a la
  aplicación indicada.
     */

    @Post('dev/simulate-entra')
    @HttpCode(200)
    // @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({
        summary: '[DEV ONLY] Simular login de Entra ID sin token real',
        description: 'Ejecuta el sync de usuario como si Azure ya hubiese validado el token. Solo disponible en NODE_ENV=development. Requiere JWT admin.',
    })
    async simulateEntra(@Body() body: SimulateEntraDto) {
        if (process.env.NODE_ENV !== 'development') {
            throw new ForbiddenException('Este endpoint solo está disponible en entorno development');
        }

        const sync = await this.authService.syncEntraUser(
            body.oid,
            body.email,
            body.name,
            body.applicationId,
        );

        return {
            valid: true,
            oid: body.oid,
            email: body.email,
            userId: sync.userId,
            permissions: sync.permissions,
        };
    }

    /**
     * Genera un nuevo par de claves Ed25519 y actualiza el proceso en caliente.
     * La clave privada se devuelve UNA SOLA VEZ — guárdala inmediatamente.
     * Requiere JWT de admin (super-admin).
     *
     * IMPORTANTE: este endpoint actualiza process.env en memoria.
     * Para que persista entre reinicios hay que copiar las claves al .env correspondiente.
     */
    @Post('admin/keypair')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('super-admin')
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Generar nuevo keypair Ed25519 (solo super-admin)',
        description:
            'Genera un par de claves Ed25519, actualiza la configuración en memoria del proceso ' +
            'y retorna ambas claves. La clave PRIVADA se muestra una sola vez — cópiala al .env de abac-microservice. ' +
            'La clave PÚBLICA debe copiarse al .env de api-gateway, monolith y api-snowq-service.',
    })
    generateEd25519Keypair() {
        const { publicKey, privateKey } = JwtEd25519Service.generateKeyPair();
        const kid = process.env.ED25519_KID ?? 'abac-m2m-v1';

        // Actualizar en memoria para que el JWKS y la firma usen la clave nueva de inmediato
        process.env.ED25519_PRIVATE_KEY = privateKey;
        process.env.ED25519_PUBLIC_KEY  = publicKey;

        return {
            kid,
            publicKey,
            privateKey,
            warning: 'Guarda la clave privada ahora — no se puede recuperar después. Actualiza .env.* manualmente para que persista tras reinicio.',
            envVars: {
                abac: `ED25519_PRIVATE_KEY=${privateKey}\nED25519_PUBLIC_KEY=${publicKey}\nED25519_KID=${kid}`,
                verifiers: `ED25519_PUBLIC_KEY=${publicKey}`,
            },
        };
    }

    /**
     * JWKS endpoint — expone la clave pública Ed25519 para verificación de tokens M2M.
     * Formato compatible con RFC 7517. Solo OKP/EdDSA/Ed25519.
     * Los verificadores (api-gateway, monolith, api-snowq) pueden usar este endpoint
     * para obtener la clave pública sin hardcodearla en sus .env.
     */
    @Get('.well-known/jwks.json')
    @ApiOperation({ summary: 'JWKS — clave pública Ed25519 para verificación de tokens M2M' })
    getJwks() {
        const publicKeyBase64 = process.env.ED25519_PUBLIC_KEY;
        const kid             = process.env.ED25519_KID ?? 'abac-m2m-v1';

        if (!publicKeyBase64) {
            return { keys: [] };
        }

        // Convertir Base64 → Base64Url (sin padding)
        const x = Buffer.from(publicKeyBase64, 'base64')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        return {
            keys: [{
                kty: 'OKP',
                crv: 'Ed25519',
                use: 'sig',
                alg: 'EdDSA',
                kid,
                x,
            }],
        };
    }
}
