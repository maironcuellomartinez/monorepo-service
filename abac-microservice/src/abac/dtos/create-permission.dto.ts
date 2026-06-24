import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreatePermissionDto {
    @IsString()
    @IsNotEmpty()
    resource!: string;

    @IsString()
    @IsNotEmpty()
    action!: string;

    @IsString()
    description?: string;

    @IsString()
    category?: string;

    @IsInt()
    weight?: number; // peso de la regla

    @IsString()
    @IsOptional()
    createdBy?: string;

    @IsString()
    @IsOptional()
    updatedBy?: string;
}
