import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { IssueCategory } from '../../../core/domain/enums/issue-category.enum';

export class CreateIssueTypeDto {
  @ApiPropertyOptional({
    example: 'uuid-tree',
    description:
      'ID del árbol de categorías. Si se omite, se usa el primero disponible.',
  })
  @IsOptional()
  @IsString()
  treeId?: string;

  @ApiProperty({ example: 'Hardware — Teclado / Mouse' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: IssueCategory, example: IssueCategory.ISSUE })
  @IsString()
  @IsNotEmpty()
  category: IssueCategory;

  @ApiPropertyOptional({ example: 'Portátil' })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional({ example: 'hardware' })
  @IsOptional()
  @IsString()
  servicenowCategory?: string;

  @ApiPropertyOptional({ example: 'Hardware Failure' })
  @IsOptional()
  @IsString()
  servicenowCloseCategory?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Urgencia SN (1–3). Default 2.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  snUrgency?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Impacto SN (1–3). Default 2.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  snImpact?: number;

  @ApiPropertyOptional({
    example: 'medium',
    enum: ['critical', 'high', 'medium', 'low'],
    description: 'Severidad SN. Default medium.',
  })
  @IsOptional()
  @IsIn(['critical', 'high', 'medium', 'low'])
  snSeverity?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  workMinutes?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  spareMinutes?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  closeMinutes?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  notUserVisible?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional({ example: 'keyboard' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  npsDisabled?: boolean;
}

export class UpdateIssueTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: IssueCategory })
  @IsOptional()
  @IsString()
  category?: IssueCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  servicenowCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  servicenowCloseCategory?: string;

  @ApiPropertyOptional({ enum: [1, 2, 3] })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  snUrgency?: number;

  @ApiPropertyOptional({ enum: [1, 2, 3] })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  snImpact?: number;

  @ApiPropertyOptional({ enum: ['critical', 'high', 'medium', 'low'] })
  @IsOptional()
  @IsIn(['critical', 'high', 'medium', 'low'])
  snSeverity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  workMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  spareMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  closeMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notUserVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  npsDisabled?: boolean;
}
