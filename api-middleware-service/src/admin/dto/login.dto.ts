import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ example: 'admin', description: 'Nombre de usuario administrador' })
    @IsString()
    @IsNotEmpty()
    username!: string;

    @ApiProperty({ example: 'password123', description: 'Contrasena del administrador' })
    @IsString()
    @IsNotEmpty()
    password!: string;
}
