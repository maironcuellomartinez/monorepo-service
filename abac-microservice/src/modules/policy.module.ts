import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from '../entities/policy.entity';
import { PolicyRule } from '../entities/policy-rule.entity';
import { PolicyPermission } from '../entities/policy-permission.entity';
import { Permission } from '../entities/permission.entity';
import { Application } from '../entities/application.entity';
import { PolicyService } from '../abac/services/policy.service';
import { PolicyController } from '../abac/controllers/policy.controller';
import { AuditModule } from './audit.module';
import { RolesGuard } from '../abac/guards/roles.guard';
import { AbacService } from '../abac/services/abac.service';
import { CacheModule } from '@nestjs/cache-manager';
import { CacheLocalModule } from 'src/cache';
import { AbacModule } from 'src/abac/abac.module';
import { Role, RolePermission, User, UserApplication, UserRole } from 'src/entities';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Policy,
            PolicyRule,
            PolicyPermission,
            Permission,
            Application,
            User,
            UserApplication,
            Role,
            RolePermission,
            UserRole,
        ]),
        AuditModule,
        CacheLocalModule,
        AbacModule,
    ],
    providers: [PolicyService, RolesGuard],
    controllers: [PolicyController],
    exports: [PolicyService],
})
export class PolicyModule { }