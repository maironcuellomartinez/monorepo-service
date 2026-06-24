import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class RegisterSnowGroupDto {
    @ApiProperty({ example: 'Soporte Corner Valencia', description: 'Nombre del grupo resolutor en ServiceNow' })
    @IsString() @IsNotEmpty()
    groupName: string;

    @ApiPropertyOptional({ example: 'Grupo resolutor del corner presencial en Valencia' })
    @IsOptional() @IsString()
    description?: string;
}

export class UpdateSnowGroupDto {
    @ApiPropertyOptional({ example: 'Descripcion actualizada' })
    @IsOptional() @IsString()
    description?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional() @IsBoolean()
    isActive?: boolean;
}
