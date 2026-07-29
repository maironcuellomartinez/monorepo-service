import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ChangeAppointmentStatusDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;

    @IsString()
    @IsNotEmpty()
    newStatus: string;

    @IsOptional()
    @IsString()
    comment?: string;
}
