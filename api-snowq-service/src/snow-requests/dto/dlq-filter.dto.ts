import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestType } from 'src/common/enum/request-type.enum';

export class DlqFilterDto {
    @IsOptional()
    @IsEnum(RequestType)
    type?: RequestType;

    @IsOptional()
    @IsString()
    source?: string;

    /** Incluye registros con updatedAt >= since (ISO 8601) */
    @IsOptional()
    @IsDateString()
    since?: string;

    /** Incluye registros con updatedAt <= until (ISO 8601) */
    @IsOptional()
    @IsDateString()
    until?: string;
}
