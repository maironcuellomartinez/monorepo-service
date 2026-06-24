import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalClientEntity } from './entities/external-client.entity';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { AdminApiKeyGuard } from './guards/admin-api-key.guard';
import { AdminModule } from '../admin/admin.module';

@Module({
    imports: [TypeOrmModule.forFeature([ExternalClientEntity, RefreshTokenEntity]), AdminModule],
    providers: [ClientsService, AdminApiKeyGuard],
    controllers: [ClientsController],
    exports: [ClientsService],
})
export class ClientsModule {}
