import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { RequestType } from '../enum';

export class CreateIncidenceDto {
    @IsString()
    description: string;

    @IsString()
    type: RequestType;

    @IsEnum(['critical', 'high', 'medium', 'low'])
    @IsNotEmpty()
    severity: string;

    @IsNumber({ allowNaN: false, allowInfinity: false })
    impact: number;  // 1: bajo, 2: medio, 3: alto

    @IsObject()
    payload: Record<string, unknown>;

    @IsNumber({ allowNaN: false, allowInfinity: false })
    urgency: number; // 1: bajo, 2: medio, 3: alto

    @IsNumber({ allowNaN: false, allowInfinity: false })
    priority: number; // 1: bajo, 2: medio, 3: alto

    @IsNotEmpty()
    @IsString()
    source: string;

    @IsOptional()
    @IsBoolean()
    immediate?: boolean;
}
