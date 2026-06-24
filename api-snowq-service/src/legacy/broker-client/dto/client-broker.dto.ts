import { IsBoolean, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

/**
 * DTO para publicar mensaje
 */
export class PublishMessageDto {
    @IsString({ message: 'messageId debe ser UUID v4' })
    @IsNotEmpty()
    messageId: string;

    @IsString({ message: 'exchange es requerido' })
    @IsNotEmpty()
    exchange: string;

    @IsString({ message: 'routingKey es requerido' })
    @IsNotEmpty()
    routingKey: string;

    @IsObject({ message: 'data debe ser un objeto' })
    @IsNotEmpty()
    data: Record<string, any>;

    @IsObject()
    @IsOptional()
    headers?: Record<string, any>;

    @IsNumber()
    @IsOptional()
    @Min(0)
    timestamp?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    ttl?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    @Max(10)
    priority?: number;

    @IsBoolean()
    @IsOptional()
    persistent?: boolean;

}
