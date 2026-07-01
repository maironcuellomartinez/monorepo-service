// api-gateway/inbound/auth/auth.controller.ts
//
// Nota: el login por email/contraseña NO está disponible en esta versión.
// Los usuarios finales se autentican exclusivamente con Entra ID (Azure AD).
// El token Azure se pasa directamente como Bearer — el gateway lo detecta y
// delega la validación JWKS a abac-microservice (POST /auth/validate-entra).
//
// Los servicios internos obtienen tokens M2M via POST /auth/m2m-token directamente en ABAC.
// Las apps externas usan OAuth 2.0 Client Credentials via POST /auth/oauth/token en ABAC.
import { Body, Controller, ForbiddenException, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MonolithClient } from '../../client/monolith.client';
import { AbacClient } from '../../auth/abac.client';
import { CurrentUser, JwtPayload } from '../../auth/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { TracingService } from '@app/observability';

class DevLoginDto {
    @ApiProperty({ example: 'empleado1@eventcorner.com' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @ApiPropertyOptional({ example: 'dev-user-001', description: 'Azure AD OID simulado. Default: hash del email.' })
    @IsString()
    @IsOptional()
    oid?: string;

    @ApiPropertyOptional({ example: 'Juan Pérez' })
    @IsString()
    @IsOptional()
    name?: string;
}

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
    constructor(
        private readonly monolith: MonolithClient,
        private readonly abacClient: AbacClient,
        private readonly tracing: TracingService,
    ) {}

    /**
     * [DEV ONLY] Login sin Azure AD — genera un token dev:* y lo valida contra ABAC.
     * Solo disponible cuando NODE_ENV=development y Entra ID no está configurado.
     * El accessToken retornado se usa como Bearer en todos los requests subsiguientes,
     * exactamente igual que un token real de Azure AD.
     */
    @Post('dev/login')
    @HttpCode(200)
    @Public()
    @ApiOperation({
        summary: '[DEV ONLY] Login sin Azure AD',
        description:
            'Genera un token dev:<base64> y lo valida contra ABAC. ' +
            'Solo funciona con NODE_ENV=development y sin AZURE_TENANT_ID configurado. ' +
            'Retorna accessToken listo para usar como Bearer en todos los endpoints.',
    })
    async devLogin(@Body() body: DevLoginDto) {
        return this.tracing.run('gateway.controller.auth.devLogin', { kind: 'server' }, () => this._devLogin(body));
    }
    private async _devLogin(body: DevLoginDto) {
        if (process.env.NODE_ENV !== 'development') {
            throw new ForbiddenException('Este endpoint solo está disponible en entorno development');
        }

        // Construir dev token con formato que ABAC reconoce en el bypass
        const oid = body.oid ?? `dev-${Buffer.from(body.email).toString('base64url').slice(0, 16)}`;
        const payload = JSON.stringify({ oid, email: body.email, name: body.name ?? body.email.split('@')[0] });
        const accessToken = `dev:${Buffer.from(payload).toString('base64url')}`;

        // Validar contra ABAC — sincroniza el usuario y retorna permisos
        const result = await this.abacClient.validateToken(accessToken);
        if (!result) {
            throw new ForbiddenException(
                'ABAC no pudo procesar el token de desarrollo. ' +
                'Verifica que abac-microservice esté corriendo y que NODE_ENV=development en ABAC.',
            );
        }

        return {
            accessToken,
            tokenType: 'Bearer',
            userId: result.userId,
            email: result.email,
            firstName: result.firstName,
            lastName: result.lastName,
            permissions: result.permissions,
        };
    }

    /**
     * Retorna el perfil del usuario autenticado, sincronizando con el monolith.
     * - Si el usuario no existe en el monolith → lo crea (lazy provisioning).
     * - Si existe → actualiza nombre/email y retorna.
     * Llamado por el frontend después del login para obtener el monolithUserId (customerId).
     */
    @Get('me')
    @UseGuards(JwtGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Perfil del usuario autenticado (con sync al monolith)',
        description: 'Upsert del usuario en el monolith vía externalId. Retorna monolithUserId para usar como customerId.',
    })
    async me(@CurrentUser() user: JwtPayload) {
        const monolithUser = await this.monolith.post<{
            id: string;
            companyId: string | null;
            principalName: string | null;
            isActive: boolean;
        }>('/users/sync', {
            external_id: user.sub,
            email: user.email,
            name: user.firstName,
            last_name: user.lastName,
            full_name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || undefined,
            principal_name: user.username,
        });

        // Bloquear acceso si el usuario fue desactivado en el monolito
        if (!monolithUser.isActive) {
            throw new ForbiddenException('Tu cuenta ha sido desactivada. Contacta al administrador.');
        }

        // Sync de dispositivos desde Minerva — fire-and-forget, no bloquea el login
        this.monolith.post(`/internal/devices/sync-for-user/${monolithUser.id}`, {}).catch(() => {});

        // Si el usuario tiene el permiso de técnico, buscar su perfil de técnico.
        // Si no existe todavía, auto-crearlo (ABAC es la fuente de verdad del rol).
        const isTechnician = user.permissions?.includes('dashboard-technician:read');
        let technicianId: string | null = null;
        if (isTechnician) {
            const technicianProfile = await this.monolith.get<{ id: string } | null>(
                `/technicians/by-user/${monolithUser.id}`,
            ).catch(() => null);

            if (technicianProfile?.id) {
                technicianId = technicianProfile.id;
            } else {
                // Primera vez que este usuario llega con rol técnico → auto-provisionar
                const created = await this.monolith.post<{ id: string }>('/technicians', {
                    userId: monolithUser.id,
                    name: user.firstName ?? user.email ?? 'Técnico',
                    lastName: user.lastName,
                    email: user.email,
                }).catch(() => null);
                technicianId = created?.id ?? null;
            }
        }

        return {
            // ABAC fields
            abacUserId: user.sub,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            permissions: user.permissions,
            // Monolith fields
            monolithUserId: monolithUser.id,
            companyId: monolithUser.companyId,
            principalName: monolithUser.principalName,
            isActive: monolithUser.isActive,
            // Technician field (null si no es técnico o aún no tiene corner asignado)
            technicianId,
        };
    }
}
