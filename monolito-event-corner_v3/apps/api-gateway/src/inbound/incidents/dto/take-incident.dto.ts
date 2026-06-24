import { IsString, IsNotEmpty } from 'class-validator';

export class TakeIncidentDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;
}
