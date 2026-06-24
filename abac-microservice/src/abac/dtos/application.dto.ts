import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===== INTERNAL APPLICATION =====

export class CreateApplicationDto {
    @ApiProperty({ example: 'api-gateway', description: 'Nombre único de la aplicación' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiPropertyOptional({ example: 'API Gateway principal del ecosistema' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ example: 'development', enum: ['development', 'staging', 'production'] })
    @IsString()
    @IsOptional()
    environment?: string;

    @ApiPropertyOptional({ type: 'object', additionalProperties: true })
    @IsOptional()
    settings?: Record<string, any>;

    @ApiProperty({ description: 'ID del usuario administrador que crea la aplicación' })
    @IsString()
    @IsNotEmpty()
    createdBy!: string;
}

// ===== OAUTH 2.0 CLIENT =====

export class CreateOAuthClientDto {
    @ApiProperty({ example: 'partner-portal', description: 'Nombre único del cliente OAuth' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiPropertyOptional({ example: 'Portal externo del partner XYZ' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        description: 'ID de la App Nativa (type="internal") a la que pertenece este cliente OAuth. Sus permisos ABAC definen el máximo de scopes posibles.',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    })
    @IsString()
    @IsNotEmpty()
    ownerApplicationId!: string;

    @ApiProperty({
        description: 'Lista de scopes permitidos (resource:action). Intersección con los permisos del owner.',
        example: ['incidents:read', 'requests:read'],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    scopes!: string[];

    @ApiPropertyOptional({
        example: 180,
        description: 'Duración de las credenciales en días antes de expirar (default: 180)',
    })
    @IsInt()
    @Min(1)
    @IsOptional()
    tokenDurationDays?: number;
}

// ===== UPDATE SCOPES =====

export class UpdateScopesDto {
    @ApiProperty({
        description: 'Nueva lista de scopes permitidos para el OAuth client',
        example: ['incidents:read', 'requests:read', 'requests:write'],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    scopes!: string[];
}

// ===== M2M SERVICE =====

export class CreateM2mServiceDto {
    @ApiProperty({ example: 'api-gateway', description: 'Nombre único del servicio de infraestructura' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiPropertyOptional({ example: 'API Gateway principal del ecosistema' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'ID de la App Nativa (type="internal") a la que pertenece este servicio. Define el ecosistema y acota los permisos posibles del JWT.',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    })
    @IsString()
    @IsOptional()
    ownerApplicationId?: string;

    @ApiPropertyOptional({
        example: 365,
        description: 'Duración del JWT emitido en días (default: 365)',
    })
    @IsInt()
    @Min(1)
    @IsOptional()
    tokenDurationDays?: number;
}

export class IssueTokenDto {
    @ApiPropertyOptional({ description: 'ID del admin que emite el token (audit trail)' })
    @IsString()
    @IsOptional()
    issuedBy?: string;

    @ApiPropertyOptional({ description: 'Duración del token en días. Si se omite usa tokenDurationDays de la aplicación.', minimum: 1, maximum: 730 })
    @IsNumber()
    @IsOptional()
    @Min(1)
    @Max(730)
    durationDays?: number;
}

// ===== ROTATE / REGENERATE =====

export class RotateCredentialsDto {
    @ApiProperty({ description: 'ID del usuario que solicita la rotación (audit trail)' })
    @IsString()
    @IsNotEmpty()
    updatedBy!: string;
}
