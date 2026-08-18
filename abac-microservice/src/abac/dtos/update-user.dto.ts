import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'Alice' })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiPropertyOptional({ example: 'Smith' })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiPropertyOptional({ example: 'alice.smith' })
    @IsString()
    @IsOptional()
    username?: string;

    @ApiPropertyOptional({ example: '+1234567890' })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiPropertyOptional({ type: Object })
    @IsObject()
    @IsOptional()
    profile?: Record<string, any>;

    @ApiPropertyOptional({ example: null, description: 'Enviar null para desvincular de Azure AD' })
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value ?? null)
    entraId?: string | null;
}
