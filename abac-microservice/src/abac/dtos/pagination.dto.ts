import { IsInt } from "class-validator";

export class PaginationDto {
    @IsInt()
    page!: number;

    @IsInt()
    limit!: number;
}