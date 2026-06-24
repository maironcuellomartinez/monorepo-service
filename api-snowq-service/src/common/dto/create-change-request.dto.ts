import { IsString } from "class-validator";

export class CreateChangeRequestDto {
    @IsString()
    description: string;

    @IsString()
    reason: string;

    @IsString()
    change_type: string;

    @IsString()
    start_date: string;

    @IsString()
    end_date: string;
}
  