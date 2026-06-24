import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===== ADMIN LOGIN =====

export class AdminLoginDto {
    @ApiProperty({ example: 'admin@eventcorner.com', description: 'Email del usuario administrador' })
    @IsString()
    @IsNotEmpty()
    email!: string;

    @ApiProperty({ example: '••••••••', description: 'Contraseña del administrador' })
    @IsString()
    @IsNotEmpty()
    password!: string;

    @ApiPropertyOptional({ description: 'ID de aplicación (se resuelve automáticamente si no se provee)' })
    @IsString()
    @IsOptional()
    applicationId?: string;
}

// ===== SERVICE TOKEN (integración ad-hoc, corta duración) =====

export class ServiceTokenDto {
    @ApiProperty({ example: 'ak_...', description: 'API Key de la aplicación registrada (type=internal)' })
    @IsString()
    @IsNotEmpty()
    apiKey!: string;

    @ApiProperty({ example: 'sec_...', description: 'API Secret de la aplicación registrada' })
    @IsString()
    @IsNotEmpty()
    apiSecret!: string;
}

// ===== OAUTH 2.0 CLIENT CREDENTIALS (RFC 6749) =====

export class OAuthTokenDto {
    @ApiProperty({
        example: 'client_credentials',
        description: 'Tipo de grant. Solo se soporta "client_credentials".',
    })
    @IsString()
    @IsNotEmpty()
    grant_type!: string;

    @ApiProperty({ example: 'ak_...', description: 'client_id del OAuth client registrado' })
    @IsString()
    @IsNotEmpty()
    client_id!: string;

    @ApiProperty({ example: 'sec_...', description: 'client_secret del OAuth client' })
    @IsString()
    @IsNotEmpty()
    client_secret!: string;

    @ApiPropertyOptional({
        example: 'incidents:read requests:write',
        description: 'Scopes solicitados (space-delimited, RFC 6749). Si se omite, se conceden todos los scopes permitidos.',
    })
    @IsString()
    @IsOptional()
    scope?: string;
}

// ===== DEV: SIMULATE ENTRA TOKEN (solo development) =====

export class SimulateEntraDto {
    @ApiProperty({ example: 'oid-abc-123', description: 'Azure AD object ID (oid) del usuario' })
    @IsString()
    @IsNotEmpty()
    oid!: string;

    @ApiProperty({ example: 'usuario@empresa.com', description: 'Email / preferred_username del usuario' })
    @IsString()
    @IsNotEmpty()
    email!: string;

    @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Display name del usuario' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'ID de aplicación ABAC donde se sincroniza el usuario' })
    @IsString()
    @IsOptional()
    applicationId?: string;
}

// ===== ENTRA RECAP (refrescar permisos después de asignar roles) =====

export class RecapEntraDto {
    @ApiProperty({ description: 'ID del usuario en ABAC' })
    @IsString()
    @IsNotEmpty()
    userId!: string;

    @ApiProperty({ description: 'ID de la aplicación ABAC' })
    @IsString()
    @IsNotEmpty()
    applicationId!: string;
}

// ===== VALIDATE ENTRA TOKEN (Azure AD) =====

export class ValidateEntraTokenDto {
    @ApiProperty({ description: 'Token Bearer emitido por Microsoft Entra ID (Azure AD)' })
    @IsString()
    @IsNotEmpty()
    token!: string;

    @ApiPropertyOptional({ description: 'ID de aplicación ABAC donde se sincroniza el usuario' })
    @IsString()
    @IsOptional()
    applicationId?: string;
}
