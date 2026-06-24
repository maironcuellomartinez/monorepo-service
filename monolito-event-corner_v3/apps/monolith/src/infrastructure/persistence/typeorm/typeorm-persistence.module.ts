// infrastructure/persistence/typeorm/typeorm-persistence.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entidades
import { ServiceNowProfileEntity } from './entities/servicenow-profile.entity';
import { CompanyEntity } from './entities/company.entity';
import { IssueTypeEntity } from './entities/issue-type.entity';
import { CornerEntity } from './entities/corner.entity';
import { CornerScheduleEntity } from './entities/corner-schedule.entity';
import { ScheduleAssignmentEntity } from './entities/schedule-assignment.entity';
import { TechnicianEntity } from './entities/technician.entity';
import { CornerSlotEntity } from './entities/corner-slot.entity';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentSlotEntity } from './entities/incident-slot.entity';
import { IncidentTimelineEntity } from './entities/incident-timeline.entity';
import { UserEntity } from './entities/user.entity';
import { DeviceEntity } from './entities/device.entity';
import { LockerEntity } from './entities/locker.entity';
import { RequestEntity } from './entities/request.entity';
import { RequestActivityEntity } from './entities/request-activity.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';

// Repositorios
import { TypeOrmServiceNowProfileRepository } from './repositories/servicenow-profile.repository';
import { TypeOrmCompanyRepository } from './repositories/company.repository';
import { TypeOrmIssueTypeRepository } from './repositories/issue-type.repository';
import { COMPANY_REPOSITORY, CORNER_REPOSITORY, CORNER_ISSUE_CONFIG_REPOSITORY, DEVICE_REPOSITORY, INCIDENT_REPOSITORY, ISSUE_TYPE_REPOSITORY, ISSUE_TYPE_TREE_REPOSITORY, LOCKER_REPOSITORY, REQUEST_REPOSITORY, SCHEDULE_REPOSITORY, SERVICE_NOW_PROFILE_REPOSITORY, SERVICENOW_GROUP_REPOSITORY, SLOT_REPOSITORY, TECHNICIAN_REPOSITORY, USER_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { TypeOrmCornerRepository } from './repositories/corner.repository';
import { TypeOrmScheduleRepository } from './repositories/schedule.repository';
import { TypeOrmTechnicianRepository } from './repositories/technician.repository';
import { TypeOrmSlotRepository } from './repositories/slot.repository';
import { TypeOrmIncidentRepository } from './repositories/incident.repository';
import { TypeOrmUserRepository } from './repositories/user.repository';
import { TypeOrmDeviceRepository } from './repositories/device.repository';
import { TypeOrmLockerRepository } from './repositories/locker.repository';
import { TypeOrmRequestRepository } from './repositories/request.repository';
import { IssueTypeTreeEntity } from './entities/issue-type-tree.entity';
import { TypeOrmIssueTypeTreeRepository } from './repositories/issue-type-tree.repository';
import { CompanyIssueConfigEntity } from './entities/corner-issue-config.entity';
import { TypeOrmCompanyIssueConfigRepository } from './repositories/corner-issue-config.repository';
import { ServiceNowGroupEntity } from './entities/servicenow-group.entity';
import { TypeOrmServiceNowGroupRepository } from './repositories/servicenow-group.repository';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            IssueTypeTreeEntity,
            ServiceNowProfileEntity,
            CompanyEntity,
            IssueTypeEntity,
            CornerEntity,
            CornerScheduleEntity,
            ScheduleAssignmentEntity,
            TechnicianEntity,
            CornerSlotEntity,
            IncidentEntity,
            IncidentSlotEntity,
            IncidentTimelineEntity,
            UserEntity,
            DeviceEntity,
            LockerEntity,
            RequestEntity,
            RequestActivityEntity,
            OutboxEventEntity,
            CompanyIssueConfigEntity,
            ServiceNowGroupEntity,
        ]),
    ],
    providers: [
        // Repositorios usando símbolos como tokens
        {
            provide: ISSUE_TYPE_TREE_REPOSITORY,
            useClass: TypeOrmIssueTypeTreeRepository,
        },
        {
            provide: SERVICE_NOW_PROFILE_REPOSITORY,
            useClass: TypeOrmServiceNowProfileRepository,
        },
        {
            provide: COMPANY_REPOSITORY,
            useClass: TypeOrmCompanyRepository,
        },
        {
            provide: ISSUE_TYPE_REPOSITORY,
            useClass: TypeOrmIssueTypeRepository,
        },
        {
            provide: CORNER_REPOSITORY,
            useClass: TypeOrmCornerRepository,
        },
        {
            provide: SCHEDULE_REPOSITORY,
            useClass: TypeOrmScheduleRepository,
        },
        {
            provide: TECHNICIAN_REPOSITORY,
            useClass: TypeOrmTechnicianRepository,
        },
        {
            provide: SLOT_REPOSITORY,
            useClass: TypeOrmSlotRepository,
        },
        {
            provide: INCIDENT_REPOSITORY,
            useClass: TypeOrmIncidentRepository,
        },
        {
            provide: USER_REPOSITORY,
            useClass: TypeOrmUserRepository,
        },
        {
            provide: DEVICE_REPOSITORY,
            useClass: TypeOrmDeviceRepository,
        },
        {
            provide: LOCKER_REPOSITORY,
            useClass: TypeOrmLockerRepository,
        },
        {
            provide: REQUEST_REPOSITORY,
            useClass: TypeOrmRequestRepository,
        },
        {
            provide: CORNER_ISSUE_CONFIG_REPOSITORY,
            useClass: TypeOrmCompanyIssueConfigRepository,
        },
        {
            provide: SERVICENOW_GROUP_REPOSITORY,
            useClass: TypeOrmServiceNowGroupRepository,
        },
    ],
    exports: [
        TypeOrmModule,          // expone los @InjectRepository() de todas las entidades registradas
        ISSUE_TYPE_TREE_REPOSITORY,
        SERVICE_NOW_PROFILE_REPOSITORY,
        COMPANY_REPOSITORY,
        ISSUE_TYPE_REPOSITORY,
        CORNER_REPOSITORY,
        SCHEDULE_REPOSITORY,
        TECHNICIAN_REPOSITORY,
        SLOT_REPOSITORY,
        INCIDENT_REPOSITORY,
        USER_REPOSITORY,
        DEVICE_REPOSITORY,
        LOCKER_REPOSITORY,
        REQUEST_REPOSITORY,
        CORNER_ISSUE_CONFIG_REPOSITORY,
        SERVICENOW_GROUP_REPOSITORY,
    ],
})
export class TypeOrmPersistenceModule { }