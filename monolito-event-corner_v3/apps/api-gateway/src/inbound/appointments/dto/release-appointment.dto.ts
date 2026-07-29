import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ReleaseAppointmentDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;

    @IsOptional()
    @IsString()
    reason?: string;
}
