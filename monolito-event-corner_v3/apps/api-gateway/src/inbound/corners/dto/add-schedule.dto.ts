import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min } from 'class-validator';

export class AddScheduleDto {
    @IsString() @IsNotEmpty()
    name: string;

    @IsOptional() @IsString()
    dayOfWeek?: string;

    @IsString() @IsNotEmpty()
    startTime: string;

    @IsString() @IsNotEmpty()
    endTime: string;

    @IsString() @IsNotEmpty()
    validFrom: string;

    @IsString() @IsNotEmpty()
    validUntil: string;

    @IsNumber() @Min(5)
    slotDurationMinutes: number;

    @IsOptional() @IsArray() @IsString({ each: true })
    technicianIds?: string[];
}

export class AssignTechniciansDto {
    @IsArray() @IsString({ each: true })
    technicianIds: string[];
}
