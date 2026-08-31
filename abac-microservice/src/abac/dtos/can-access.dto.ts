import { IsString, IsNotEmpty, IsUUID, IsObject, IsOptional, IsArray, ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

/**
 * Igual a CanAccessDto salvo por el nombre — se declara aparte porque
 * BatchEvaluateDto necesita @ValidateNested + @Type sobre una clase propia
 * para que el ValidationPipe global entre a validar cada elemento del
 * array (con `Array<{...}>` como tipo plano, class-validator no tiene
 * forma de saber qué shape validar dentro del array).
 */
export class CanAccessItemDto extends CanAccessDto {}

export class BatchEvaluateDto {
    // Tope de 100 — sin límite, un solo POST dispara N evaluaciones ABAC
    // concurrentes (Promise.all en AbacController.batchEvaluate) contra
    // MySQL/Redis; el endpoint está detrás de ApiKeyGuard nada más, sin
    // rate limit propio (ver M-06 en la auditoría de 2026-08-31).
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => CanAccessItemDto)
    requests!: CanAccessItemDto[];
}
