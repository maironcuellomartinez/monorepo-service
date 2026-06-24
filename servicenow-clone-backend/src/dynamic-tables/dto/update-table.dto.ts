import {
    IsString,
    IsOptional,
    MaxLength,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateFieldDto } from './create-table.dto';

export class UpdateTableDto {
    @IsString()
    @IsOptional()
    @MaxLength(100)
    label?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    description?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateFieldDto)
    @IsOptional()
    fields?: CreateFieldDto[];
}