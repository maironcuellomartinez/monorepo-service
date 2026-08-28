import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterSnowGroupDto {
    @ApiProperty({ example: 'group007cornervalencia00000001', description: 'sys_id real del grupo en ServiceNow' })
    @IsString() @IsNotEmpty()
    groupId: string;

    @ApiProperty({ example: 'Soporte Corner Valencia', description: 'Nombre del grupo resolutor en ServiceNow' })
    @IsString() @IsNotEmpty()
    groupName: string;

    @ApiPropertyOptional({ example: 'Grupo resolutor del corner presencial en Valencia' })
    @IsOptional() @IsString()
    description?: string;
}

export class SyncSnowGroupItemDto {
    @ApiProperty({ example: 'group007cornervalencia00000001' })
    @IsString() @IsNotEmpty()
    groupId: string;

    @ApiProperty({ example: 'Soporte Corner Valencia' })
    @IsString() @IsNotEmpty()
    groupName: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    description?: string;
}

export class SyncSnowGroupsDto {
    @ApiProperty({ type: [SyncSnowGroupItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SyncSnowGroupItemDto)
    groups: SyncSnowGroupItemDto[];
}

export class UpdateSnowGroupDto {
    @ApiPropertyOptional({ example: 'Descripcion actualizada' })
    @IsOptional() @IsString()
    description?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional() @IsBoolean()
    isActive?: boolean;
}
