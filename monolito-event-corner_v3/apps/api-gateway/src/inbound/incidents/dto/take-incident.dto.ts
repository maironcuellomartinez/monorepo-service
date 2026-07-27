import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class TakeIncidentDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    slotIds?: string[];
}
