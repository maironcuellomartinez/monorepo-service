import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateIssueTypeDto {
    @IsString() @IsNotEmpty()
    name: string;

    @IsString() @IsNotEmpty()
    category: string;

    @IsOptional() @IsString()
    deviceType?: string;

    @IsOptional() @IsString()
    servicenowCategory?: string;

    @IsOptional() @IsString()
    servicenowCloseCategory?: string;

    @IsOptional() @IsNumber()
    workMinutes?: number;

    @IsOptional() @IsNumber()
    spareMinutes?: number;

    @IsOptional() @IsNumber()
    closeMinutes?: number;

    @IsOptional() @IsBoolean()
    notUserVisible?: boolean;

    @IsOptional() @IsNumber()
    position?: number;

    @IsOptional() @IsBoolean()
    npsDisabled?: boolean;
}

export class UpdateIssueTypeDto {
    @IsOptional() @IsString()
    name?: string;

    @IsOptional() @IsString()
    category?: string;

    @IsOptional() @IsString()
    deviceType?: string;

    @IsOptional() @IsString()
    servicenowCategory?: string;

    @IsOptional() @IsString()
    servicenowCloseCategory?: string;

    @IsOptional() @IsNumber()
    workMinutes?: number;

    @IsOptional() @IsNumber()
    spareMinutes?: number;

    @IsOptional() @IsNumber()
    closeMinutes?: number;

    @IsOptional() @IsBoolean()
    notUserVisible?: boolean;

    @IsOptional() @IsNumber()
    position?: number;

    @IsOptional() @IsBoolean()
    npsDisabled?: boolean;
}
