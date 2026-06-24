import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenRequestDto {
    @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Refresh token JWT' })
    @IsString()
    @IsNotEmpty()
    refresh_token!: string;
}

export class RefreshTokenResponseDto {
    access_token!: string;
    refresh_token!: string;
    token_type!: string;
    expires_in!: number;
    client_name!: string;
}
