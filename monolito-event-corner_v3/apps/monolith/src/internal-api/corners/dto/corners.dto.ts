import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, Matches } from 'class-validator';
import { DayOfWeek } from '../../../core/domain/enums/day-of-week.enum';

const CODE_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const CODE_MESSAGE = 'code debe ser snake_case en minúsculas (ej: local_abelias)';

export class CreateCornerDto {
    @ApiProperty({ example: 'Corner Buenos Aires', description: 'Nombre del corner' })
    @IsString() @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ example: 'local_abelias', description: 'Código técnico estable (slug). Si se omite, se autogenera desde el nombre. Es la referencia usada para sistemas externos — evitar cambiarlo luego de creado.' })
    @IsOptional() @IsString() @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
    code?: string;

    @ApiPropertyOptional({ example: false })
    @IsOptional() @IsBoolean()
    onlyTechnicians?: boolean;

    @ApiPropertyOptional({ example: 'ARG-BA-001' })
    @IsOptional() @IsString()
    servicenowLocation?: string;

    @ApiPropertyOptional({ example: 'Santander Argentina' })
    @IsOptional() @IsString()
    clientName?: string;

    @ApiPropertyOptional({ example: 'Corner de soporte en CABA' })
    @IsOptional() @IsString()
    description?: string;
}

export class UpdateCornerDto {
    @ApiPropertyOptional({ example: 'Corner Buenos Aires v2' })
    @IsOptional() @IsString()
    name?: string;

    @ApiPropertyOptional({ example: 'local_abelias', description: 'Corrección excepcional del código técnico — es una referencia externa, no editar salvo error de backfill.' })
    @IsOptional() @IsString() @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
    code?: string;

    @ApiPropertyOptional({ example: 'Santander Argentina' })
    @IsOptional() @IsString()
    clientName?: string;

    @ApiPropertyOptional({ example: 'Corner actualizado' })
    @IsOptional() @IsString()
    description?: string;

    @ApiPropertyOptional({ example: 'ARG-BA-002' })
    @IsOptional() @IsString()
    servicenowLocation?: string;

    @ApiPropertyOptional({ example: -34.6037 })
    @IsOptional() @IsNumber()
    latitude?: number;

    @ApiPropertyOptional({ example: -58.3816 })
    @IsOptional() @IsNumber()
    longitude?: number;

    @ApiPropertyOptional({ example: true })
    @IsOptional() @IsBoolean()
    onlyTechnicians?: boolean;

    @ApiPropertyOptional({ example: true })
    @IsOptional() @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ example: 'America/Argentina/Buenos_Aires' })
    @IsOptional() @IsString()
    timezone?: string;

    @ApiPropertyOptional({ example: 'AR' })
    @IsOptional() @IsString()
    country?: string;

    @ApiPropertyOptional({ example: 'Buenos Aires' })
    @IsOptional() @IsString()
    city?: string;
}

export class AddScheduleDto {
    @ApiProperty({ example: 'Turno mañana lunes' })
    @IsString() @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ enum: DayOfWeek, example: DayOfWeek.MONDAY, description: 'Omitir para aplicar el horario a todos los días del rango' })
    @IsOptional() @IsString()
    dayOfWeek?: DayOfWeek;

    @ApiProperty({ example: '09:00' })
    @IsString() @IsNotEmpty()
    startTime: string;

    @ApiProperty({ example: '18:00' })
    @IsString() @IsNotEmpty()
    endTime: string;

    @ApiProperty({ example: '2026-01-01' })
    @IsString() @IsNotEmpty()
    validFrom: string;

    @ApiProperty({ example: '2026-12-31' })
    @IsString() @IsNotEmpty()
    validUntil: string;

    @ApiProperty({ example: 60 })
    @IsNumber()
    slotDurationMinutes: number;

    @ApiPropertyOptional({ type: [String], example: ['uuid-tech-1'] })
    @IsOptional() @IsArray() @IsString({ each: true })
    technicianIds?: string[];
}

export class AssignTechniciansDto {
    @ApiProperty({ type: [String], example: ['uuid-tech-1', 'uuid-tech-2'] })
    @IsArray() @IsString({ each: true })
    technicianIds: string[];
}
