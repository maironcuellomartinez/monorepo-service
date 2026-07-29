import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class TakeAppointmentDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    slotIds?: string[];
}
