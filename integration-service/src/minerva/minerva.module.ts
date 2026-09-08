// src/minerva/minerva.module.ts
import { Module } from '@nestjs/common';
import { MinervaController } from './minerva.controller';
import { MinervaConnector } from './minerva.connector';

@Module({
    controllers: [MinervaController],
    providers: [MinervaConnector],
})
export class MinervaModule { }
