import { Module, Global } from '@nestjs/common';
import { DevicesRepository } from './devices.repository';
import { DevicesRestController } from './devices-rest.controller';

@Module({
  providers: [DevicesRepository],
  controllers: [DevicesRestController],
})
export class DevicesModule {}
