import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class RescheduleAppointmentDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;

    @IsArray()
    @IsString({ each: true })
    slotIds: string[];
}
