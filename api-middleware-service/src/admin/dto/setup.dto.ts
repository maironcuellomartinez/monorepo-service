import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetupDto {
    @ApiProperty({ example: 'admin', description: 'Nombre de usuario administrador' })
    @IsString()
    @IsNotEmpty()
    username!: string;

    @ApiProperty({ example: 'password123', description: 'Contrasena del administrador (minimo 8 caracteres)' })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    password!: string;
}
