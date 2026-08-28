import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateCompanyIssueConfigDto {
    @ApiProperty({ example: 'uuid-company', description: 'ID de la empresa' })
    @IsString() @IsNotEmpty()
    companyId: string;

    @ApiProperty({ example: 'uuid-issue-type', description: 'ID del tipo de incidencia' })
    @IsString() @IsNotEmpty()
    issueTypeId: string;

    @ApiProperty({ example: 'group003hardwaresupport000000001', description: 'sys_id del grupo resolutor en ServiceNow' })
    @IsString() @IsNotEmpty()
    servicenowGroup: string;

    @ApiPropertyOptional({ example: 90, description: 'Override de minutos de trabajo para esta combinación empresa+tipo' })
    @IsOptional() @IsNumber()
    workMinutesOverride?: number;
}

export class UpdateCompanyIssueConfigDto {
    @ApiPropertyOptional({ example: 'group004softwaresupport000000001', description: 'Nuevo sys_id del grupo resolutor' })
    @IsOptional() @IsString()
    servicenowGroup?: string;

    @ApiPropertyOptional({ example: 120, nullable: true, description: 'Nuevo override de minutos (null para quitar el override)' })
    @IsOptional() @IsNumber()
    workMinutesOverride?: number | null;
}
