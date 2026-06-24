import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Ed25519Guard } from './guards/ed25519.guard';

@Module({
    providers: [{ provide: APP_GUARD, useClass: Ed25519Guard }],
})
export class AuthModule {}
