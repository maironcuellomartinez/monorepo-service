// src/droppoint/droppoint.module.ts
import { Module } from '@nestjs/common';
import { DroppointController } from './droppoint.controller';
import { DroppointConnector } from './droppoint.connector';

@Module({
    controllers: [DroppointController],
    providers: [DroppointConnector],
})
export class DroppointModule { }
