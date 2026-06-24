import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DevicesRepository } from './devices.repository';
import { DevicesSoapService } from './devices.soap.service';
import { SoapProvider } from './soap.provider';
import { DevicesController } from './devices.controller';
import { DevicesRestController } from './devices-rest.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Device])],
  providers: [DevicesRepository, DevicesSoapService, SoapProvider],
  controllers: [DevicesController, DevicesRestController],
  exports: [DevicesSoapService],
})
export class DevicesModule {}
