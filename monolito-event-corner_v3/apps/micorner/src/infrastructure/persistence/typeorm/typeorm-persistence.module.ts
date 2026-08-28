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
import { UserEntity } from './entities/user.entity';
import { DeviceEntity } from './entities/device.entity';
import { LockerEntity } from './entities/locker.entity';
import { AppointmentEntity } from './entities/appointment.entity';
import { AppointmentSlotEntity } from './entities/appointment-slot.entity';
import { AppointmentTimelineEntity } from './entities/appointment-timeline.entity';
import { ServiceNowTicketLinkEntity } from './entities/servicenow-ticket-link.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';

// Repositorios
import { TypeOrmServiceNowProfileRepository } from './repositories/servicenow-profile.repository';
import { TypeOrmCompanyRepository } from './repositories/company.repository';
import { TypeOrmIssueTypeRepository } from './repositories/issue-type.repository';
import { COMPANY_REPOSITORY, CORNER_REPOSITORY, CORNER_ISSUE_CONFIG_REPOSITORY, DEVICE_REPOSITORY, ISSUE_TYPE_REPOSITORY, ISSUE_TYPE_TREE_REPOSITORY, LOCKER_REPOSITORY, SCHEDULE_REPOSITORY, SERVICE_NOW_PROFILE_REPOSITORY, SERVICENOW_GROUP_REPOSITORY, SLOT_REPOSITORY, TECHNICIAN_REPOSITORY, USER_REPOSITORY, APPOINTMENT_REPOSITORY, SERVICENOW_TICKET_LINK_REPOSITORY } from '@app/core/ports/outgoing/repositories/tokens';
import { TypeOrmCornerRepository } from './repositories/corner.repository';
import { TypeOrmScheduleRepository } from './repositories/schedule.repository';
import { TypeOrmTechnicianRepository } from './repositories/technician.repository';
import { TypeOrmSlotRepository } from './repositories/slot.repository';
import { TypeOrmUserRepository } from './repositories/user.repository';
import { TypeOrmDeviceRepository } from './repositories/device.repository';
import { TypeOrmLockerRepository } from './repositories/locker.repository';
import { TypeOrmAppointmentRepository } from './repositories/appointment.repository';
import { TypeOrmServiceNowTicketLinkRepository } from './repositories/servicenow-ticket-link.repository';
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
            UserEntity,
            DeviceEntity,
            LockerEntity,
            AppointmentEntity,
            AppointmentSlotEntity,
            AppointmentTimelineEntity,
            ServiceNowTicketLinkEntity,
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
            provide: APPOINTMENT_REPOSITORY,
            useClass: TypeOrmAppointmentRepository,
        },
        {
            provide: SERVICENOW_TICKET_LINK_REPOSITORY,
            useClass: TypeOrmServiceNowTicketLinkRepository,
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
        USER_REPOSITORY,
        DEVICE_REPOSITORY,
        LOCKER_REPOSITORY,
        CORNER_ISSUE_CONFIG_REPOSITORY,
        SERVICENOW_GROUP_REPOSITORY,
        APPOINTMENT_REPOSITORY,
        SERVICENOW_TICKET_LINK_REPOSITORY,
    ],
})
export class TypeOrmPersistenceModule { }