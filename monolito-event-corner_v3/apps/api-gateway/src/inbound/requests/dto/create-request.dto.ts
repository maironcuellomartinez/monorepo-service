import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateRequestDto {
    @IsString() @IsNotEmpty()
    issueTypeId: string;

    @IsOptional() @IsString()
    technicianId?: string;

    @IsString() @IsNotEmpty()
    customerId: string;

    @IsString() @IsNotEmpty()
    cornerId: string;

    @IsOptional() @IsString()
    companyId?: string;

    @IsOptional() @IsString()
    scheduledAt?: string;

    @IsOptional() @IsString()
    notes?: string;

    @IsObject()
    device: {
        serialNumber: string;
    };
}

export class UpdateRequestStatusDto {
    @IsString() @IsNotEmpty()
    technicianId: string;

    @IsString() @IsNotEmpty()
    newStatus: string;

    @IsOptional() @IsString()
    comment?: string;
}
