import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional } from 'class-validator';

export class TokenRequestDto {
    @ApiProperty({ example: 'client_credentials' })
    @IsString() @IsIn(['client_credentials'])
    grant_type!: string;

    @ApiPropertyOptional({ example: 'read write admin', description: 'Scope(s) solicitados separados por espacio' })
    @IsString()
    @IsOptional()
    scope?: string;
}

export class TokenResponseDto {
    access_token!: string;
    refresh_token?: string;
    token_type!: string;
    expires_in!: number;
    client_name!: string;
    scope?: string[];
}
