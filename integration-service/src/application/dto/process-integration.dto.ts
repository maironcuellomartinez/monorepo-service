// src/application/dto/process-integration.dto.ts
import { IsString, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessIntegrationDto {
    @ApiProperty({ description: 'Tipo de evento' })
    @IsString()
    eventType: string;

    @ApiProperty({ description: 'Sistema origen del evento' })
    @IsString()
    source: string;

    @ApiProperty({ description: 'Datos del evento' })
    @IsObject()
    payload: Record<string, any>;

    @ApiProperty({ description: 'ID de correlación', required: false })
    @IsOptional()
    @IsUUID()
    correlationId?: string;
}