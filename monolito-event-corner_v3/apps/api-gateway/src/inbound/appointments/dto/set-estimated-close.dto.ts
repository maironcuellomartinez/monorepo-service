import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class SetEstimatedCloseDto {
    @IsString()
    @IsNotEmpty()
    technicianId: string;

    @IsDateString()
    estimatedCloseAt: string;
}
