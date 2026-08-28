// core/services/core-services.module.ts
import { Global, Module } from '@nestjs/common';
import { LoggerService, TracingService } from '@app/observability';

import { IssueTypeService } from './admin/issue-type.service';
import { AppointmentService } from './appointment/appointment.service';
import { AvailabilityService } from './availability/availability.service';
import { CornerService } from './corner/corner.service';
import { ScheduleService } from './schedule/schedule.service';
import { TechnicianService } from './technician/technician.service';
import { LockerService } from './locker/locker.service';
import { DeviceService } from './device/device.service';
import { UserService } from './user/user.service';
import { CompanyService } from './company/company.service';
import { ServiceNowProfileService } from './servicenow/profile.service';
import { ServiceNowIntegrationService } from './servicenow/servicenow-integration.service';
import { CompanyIssueConfigService } from './corner-issue-config/corner-issue-config.service';
import { ServiceNowGroupService } from './servicenow/servicenow-group.service';

import {
    ISSUE_TYPE_REPOSITORY,
    ISSUE_TYPE_TREE_REPOSITORY,
    APPOINTMENT_REPOSITORY,
    SLOT_REPOSITORY,
    TECHNICIAN_REPOSITORY,
    CORNER_REPOSITORY,
    SCHEDULE_REPOSITORY,
    LOCKER_REPOSITORY,
    DEVICE_REPOSITORY,
    USER_REPOSITORY,
    COMPANY_REPOSITORY,
    SERVICE_NOW_PROFILE_REPOSITORY,
    CORNER_ISSUE_CONFIG_REPOSITORY,
    SERVICENOW_GROUP_REPOSITORY,
} from '../ports/outgoing/repositories/tokens';

import {
    ISSUE_TYPE_SERVICE,
    APPOINTMENT_SERVICE,
    AVAILABILITY_SERVICE,
    CORNER_SERVICE,
    SCHEDULE_SERVICE,
    TECHNICIAN_SERVICE,
    LOCKER_SERVICE,
    DEVICE_SERVICE,
    USER_SERVICE,
    COMPANY_SERVICE,
    SERVICENOW_PROFILE_SERVICE,
    SERVICENOW_INTEGRATION_SERVICE,
    CORNER_ISSUE_CONFIG_SERVICE,
    SERVICENOW_GROUP_SERVICE,
} from '../ports/incoming/service-tokens';

import { EVENT_BUS, CACHE, SERVICENOW_CLIENT, EXTERNAL_INVENTORY_SERVICE, HOLIDAY_PROVIDER } from '../ports/outgoing/infrastructure-tokens';

@Global()
@Module({
    providers: [
        {
            provide: ISSUE_TYPE_SERVICE,
            useFactory: (repo, treeRepo, eventBus, tracing) => new IssueTypeService(repo, treeRepo, eventBus, tracing),
            inject: [ISSUE_TYPE_REPOSITORY, ISSUE_TYPE_TREE_REPOSITORY, EVENT_BUS, TracingService],
        },
        {
            provide: APPOINTMENT_SERVICE,
            useFactory: (appointmentRepo, slotRepo, technicianRepo, cornerRepo, userRepo, companyRepo, issueTypeRepo, eventBus, cache, logger, tracing, deviceService) =>
                new AppointmentService(appointmentRepo, slotRepo, technicianRepo, cornerRepo, userRepo, companyRepo, issueTypeRepo, eventBus, cache, logger, tracing, deviceService),
            inject: [APPOINTMENT_REPOSITORY, SLOT_REPOSITORY, TECHNICIAN_REPOSITORY, CORNER_REPOSITORY, USER_REPOSITORY, COMPANY_REPOSITORY, ISSUE_TYPE_REPOSITORY, EVENT_BUS, CACHE, LoggerService, TracingService, DEVICE_SERVICE],
        },
        {
            provide: AVAILABILITY_SERVICE,
            useFactory: (cornerRepo, slotRepo, technicianRepo, appointmentRepo, cache) =>
                new AvailabilityService(cornerRepo, slotRepo, technicianRepo, appointmentRepo, cache),
            inject: [CORNER_REPOSITORY, SLOT_REPOSITORY, TECHNICIAN_REPOSITORY, APPOINTMENT_REPOSITORY, CACHE],
        },
        {
            provide: CORNER_SERVICE,
            useFactory: (cornerRepo, scheduleRepo, eventBus, tracing) =>
                new CornerService(cornerRepo, scheduleRepo, eventBus, tracing),
            inject: [CORNER_REPOSITORY, SCHEDULE_REPOSITORY, EVENT_BUS, TracingService],
        },
        {
            provide: SCHEDULE_SERVICE,
            useFactory: (scheduleRepo, cornerRepo, technicianRepo, slotRepo, eventBus, holidayProvider, tracing) =>
                new ScheduleService(scheduleRepo, cornerRepo, technicianRepo, slotRepo, eventBus, holidayProvider, tracing),
            inject: [SCHEDULE_REPOSITORY, CORNER_REPOSITORY, TECHNICIAN_REPOSITORY, SLOT_REPOSITORY, EVENT_BUS, HOLIDAY_PROVIDER, TracingService],
        },
        {
            provide: TECHNICIAN_SERVICE,
            useFactory: (technicianRepo, cornerRepo, eventBus, tracing) =>
                new TechnicianService(technicianRepo, cornerRepo, eventBus, tracing),
            inject: [TECHNICIAN_REPOSITORY, CORNER_REPOSITORY, EVENT_BUS, TracingService],
        },
        {
            provide: LOCKER_SERVICE,
            useFactory: (lockerRepo, cornerRepo, appointmentRepo, tracing) =>
                new LockerService(lockerRepo, cornerRepo, appointmentRepo, tracing),
            inject: [LOCKER_REPOSITORY, CORNER_REPOSITORY, APPOINTMENT_REPOSITORY, TracingService],
        },
        {
            provide: DEVICE_SERVICE,
            useFactory: (deviceRepo, inventoryService, appointmentRepo, tracing) => new DeviceService(deviceRepo, inventoryService, appointmentRepo, tracing),
            inject: [DEVICE_REPOSITORY, EXTERNAL_INVENTORY_SERVICE, APPOINTMENT_REPOSITORY, TracingService],
        },
        {
            provide: USER_SERVICE,
            useFactory: (userRepo, tracing) => new UserService(userRepo, tracing),
            inject: [USER_REPOSITORY, TracingService],
        },
        {
            provide: COMPANY_SERVICE,
            useFactory: (companyRepo, treeRepo, tracing) =>
                new CompanyService(companyRepo, treeRepo, tracing),
            inject: [COMPANY_REPOSITORY, ISSUE_TYPE_TREE_REPOSITORY, TracingService],
        },
        {
            provide: SERVICENOW_PROFILE_SERVICE,
            useFactory: (profileRepo, tracing) => new ServiceNowProfileService(profileRepo, tracing),
            inject: [SERVICE_NOW_PROFILE_REPOSITORY, TracingService],
        },
        {
            provide: SERVICENOW_INTEGRATION_SERVICE,
            useFactory: (issueTypeRepo, cornerRepo, profileRepo, snClient, cornerIssueConfigRepo, tracing) =>
                new ServiceNowIntegrationService(issueTypeRepo, cornerRepo, profileRepo, snClient, cornerIssueConfigRepo, tracing),
            inject: [ISSUE_TYPE_REPOSITORY, CORNER_REPOSITORY, SERVICE_NOW_PROFILE_REPOSITORY, SERVICENOW_CLIENT, CORNER_ISSUE_CONFIG_REPOSITORY, TracingService],
        },
        {
            provide: CORNER_ISSUE_CONFIG_SERVICE,
            useFactory: (repo, tracing) => new CompanyIssueConfigService(repo, tracing),
            inject: [CORNER_ISSUE_CONFIG_REPOSITORY, TracingService],
        },
        {
            provide: SERVICENOW_GROUP_SERVICE,
            useFactory: (repo, tracing) => new ServiceNowGroupService(repo, tracing),
            inject: [SERVICENOW_GROUP_REPOSITORY, TracingService],
        },
    ],
    exports: [
        ISSUE_TYPE_SERVICE,
        APPOINTMENT_SERVICE,
        AVAILABILITY_SERVICE,
        CORNER_SERVICE,
        SCHEDULE_SERVICE,
        TECHNICIAN_SERVICE,
        LOCKER_SERVICE,
        DEVICE_SERVICE,
        USER_SERVICE,
        COMPANY_SERVICE,
        SERVICENOW_PROFILE_SERVICE,
        SERVICENOW_INTEGRATION_SERVICE,
        CORNER_ISSUE_CONFIG_SERVICE,
        SERVICENOW_GROUP_SERVICE,
    ],
})
export class CoreServicesModule { }
