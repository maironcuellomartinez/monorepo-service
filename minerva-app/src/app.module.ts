import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DevicesModule } from './devices/devices.module';

// Mock del sistema Minerva real — sin base de datos propia. Los dispositivos
// viven en memoria (ver devices/devices.repository.ts) y se reinician junto
// con el proceso; es intencional para un servicio que solo simula el
// inventario externo en pruebas locales.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DevicesModule,
  ],
})
export class AppModule {}
