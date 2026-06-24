import { IsString, IsNotEmpty, IsUUID, IsObject, IsOptional } from 'class-validator';

export class CanAccessDto {
    @IsUUID()
    @IsNotEmpty()
    userId!: string;

    @IsUUID()
    @IsNotEmpty()
    applicationId!: string;

    @IsString()
    @IsNotEmpty()
    resource!: string;

    @IsString()
    @IsNotEmpty()
    action!: string;

    @IsObject()
    @IsOptional()
    context?: Record<string, any>;
}

export class BatchEvaluateDto {
    @IsObject({ each: true })
    @IsNotEmpty()
    requests!: Array<{
        userId: string;
        applicationId: string;
        resource: string;
        action: string;
        context?: Record<string, any>;
    }>;
}
