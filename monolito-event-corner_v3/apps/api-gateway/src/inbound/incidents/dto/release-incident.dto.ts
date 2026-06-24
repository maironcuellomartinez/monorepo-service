import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ReleaseIncidentDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;

    @IsOptional()
    @IsString()
    reason?: string;
}
