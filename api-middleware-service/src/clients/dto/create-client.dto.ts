import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsInt, Min, Max, IsArray } from 'class-validator';

export class CreateClientDto {
    @ApiProperty({ example: 'Mi App Externa', description: 'Nombre de la aplicacion externa' })
    @IsString() @IsNotEmpty() @MaxLength(100)
    name!: string;

    @ApiPropertyOptional({ example: 'App de consulta de incidencias para el portal HR' })
    @IsOptional() @IsString() @MaxLength(255)
    description?: string;

    @ApiPropertyOptional({ example: 3600, description: 'Duracion del access token en segundos (min: 3600 = 1h, max: 604800 = 7 dias)' })
    @IsOptional() @IsInt() @Min(3600) @Max(604800)
    tokenExpiresInSeconds?: number;

    @ApiPropertyOptional({ example: ['records:read', 'incidents:read'], description: 'Scopes permitidos. null o ausente = sin restriccion' })
    @IsOptional() @IsArray() @IsString({ each: true })
    scopes?: string[];
}

export type ClientCredentialsResponseDto = {
    clientId: string;
    clientSecret: string;
    name: string;
    message: string;
};

export type ClientResponseDto = {
    clientId: string;
    name: string;
    description: string | null;
    isActive: boolean;
    tokenExpiresInSeconds: number;
    allowedScopes: string[] | null;
    createdAt: Date;
    updatedAt: Date;
};
