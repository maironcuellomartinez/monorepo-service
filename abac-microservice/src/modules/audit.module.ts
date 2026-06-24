import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditService } from '../abac/services/audit.service';
import { AuditInterceptor } from '../abac/interceptors/audit.interceptor';
import { AuditController } from 'src/abac/controllers/audit.controller';
import { AbacModule } from '../abac/abac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AuditLog]),
        JwtModule,
        AbacModule,
    ],
    controllers: [AuditController],
    providers: [AuditService, AuditInterceptor],
    exports: [AuditService, AuditInterceptor],
})
export class AuditModule { }