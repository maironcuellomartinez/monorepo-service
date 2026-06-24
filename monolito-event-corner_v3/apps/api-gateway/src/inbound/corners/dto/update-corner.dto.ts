import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdateCornerDto {
    @IsOptional() @IsString()
    name?: string;

    @IsOptional() @IsString()
    clientName?: string;

    @IsOptional() @IsString()
    description?: string;

    @IsOptional() @IsString()
    servicenowLocation?: string;

    @IsOptional() @IsBoolean()
    onlyTechnicians?: boolean;

    @IsOptional() @IsNumber()
    slotDurationMinutes?: number;

    @IsOptional() @IsBoolean()
    isActive?: boolean;

    @IsOptional() @IsString()
    country?: string;

    @IsOptional() @IsString()
    timezone?: string;

    @IsOptional() @IsNumber()
    latitude?: number;

    @IsOptional() @IsNumber()
    longitude?: number;

    @IsOptional() @IsString()
    snowAssignmentGroup?: string;

    @IsOptional() @IsString()
    city?: string;
}
