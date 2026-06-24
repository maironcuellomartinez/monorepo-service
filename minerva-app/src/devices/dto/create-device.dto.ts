import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  serialNumber: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcion?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tipo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  marca: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  modelo: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  usuarioId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  usuarioNombre?: string;
}

export class UpdateDeviceDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tipo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  marca?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  usuarioId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  usuarioNombre?: string;
}

export class DeviceResponseDto {
  deviceId: string;
  nombre: string;
  serialNumber: string;
  descripcion: string | null;
  tipo: string;
  marca: string;
  modelo: string;
  usuarioId: string;
  createdAt: Date;
  updatedAt: Date;
}
