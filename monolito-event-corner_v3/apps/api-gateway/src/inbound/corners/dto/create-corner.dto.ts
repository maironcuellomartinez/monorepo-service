import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateCornerDto {
    @IsString() @IsNotEmpty()
    name: string;

    @IsOptional() @IsNumber()
    slotDurationMinutes?: number;

    @IsOptional() @IsBoolean()
    onlyTechnicians?: boolean;

    @IsOptional() @IsString()
    servicenowLocation?: string;

    @IsOptional() @IsString()
    clientName?: string;

    @IsOptional() @IsString()
    description?: string;

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
