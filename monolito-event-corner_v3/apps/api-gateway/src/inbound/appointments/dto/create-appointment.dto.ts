import { IsString, IsArray, IsOptional, IsNotEmpty, IsObject } from 'class-validator';

// api-gateway/appointments/dto/create-appointment.dto.ts
export class CreateAppointmentDto {
    @IsString()
    @IsNotEmpty()
    issueTypeId: string;

    @IsString()
    @IsNotEmpty()
    customerId: string;

    @IsString()
    @IsNotEmpty()
    cornerId: string;

    @IsArray()
    @IsString({ each: true })
    slotIds: string[];

    @IsString()
    @IsNotEmpty()
    startTime: string;

    @IsString()
    @IsNotEmpty()
    endTime: string;

    @IsString()
    @IsNotEmpty()
    origin: string;

    @IsObject()
    device: {
        serialNumber: string;
    };

    @IsOptional()
    @IsString()
    lockerId?: string;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;

    @IsOptional()
    @IsString()
    notes?: string;
}
