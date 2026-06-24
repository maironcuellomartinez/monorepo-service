import { Module } from '@nestjs/common';
import { BrokerClientService } from './broker-client.service';

@Module({
  providers: [BrokerClientService],
  exports: [BrokerClientService],
})
export class BrokerClientModule { }
