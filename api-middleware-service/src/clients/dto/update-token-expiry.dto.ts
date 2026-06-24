import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateTokenExpiryDto {
    @ApiProperty({ example: 7200, description: 'Duracion del access token en segundos (min: 3600 = 1h, max: 604800 = 7 dias)' })
    @IsInt()
    @Min(3600)
    @Max(604800)
    tokenExpiresInSeconds!: number;
}
