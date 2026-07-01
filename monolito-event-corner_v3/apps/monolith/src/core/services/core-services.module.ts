// core/services/core-services.module.ts
import { Global, Module } from '@nestjs/common';
import { LoggerService, TracingService } from '@app/observability';

import { IssueTypeService } from './admin/issue-type.service';
import { IncidentService } from './incident/incident.service';
import { AvailabilityService } from './availability/availability.service';
import { RequestService } from './request/request.service';
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
    INCIDENT_REPOSITORY,
    SLOT_REPOSITORY,
    TECHNICIAN_REPOSITORY,
    CORNER_REPOSITORY,
    SCHEDULE_REPOSITORY,
    LOCKER_REPOSITORY,
    DEVICE_REPOSITORY,
    USER_REPOSITORY,
    COMPANY_REPOSITORY,
    SERVICE_NOW_PROFILE_REPOSITORY,
    REQUEST_REPOSITORY,
    CORNER_ISSUE_CONFIG_REPOSITORY,
    SERVICENOW_GROUP_REPOSITORY,
} from '../ports/outgoing/repositories/tokens';

import {
    ISSUE_TYPE_SERVICE,
    INCIDENT_SERVICE,
    AVAILABILITY_SERVICE,
    REQUEST_SERVICE,
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
            useFactory: (repo, treeRepo, eventBus) => new IssueTypeService(repo, treeRepo, eventBus),
            inject: [ISSUE_TYPE_REPOSITORY, ISSUE_TYPE_TREE_REPOSITORY, EVENT_BUS],
        },
        {
            provide: INCIDENT_SERVICE,
            useFactory: (incidentRepo, slotRepo, technicianRepo, cornerRepo, userRepo, companyRepo, issueTypeRepo, eventBus, cache, logger, tracing, deviceService) =>
                new IncidentService(incidentRepo, slotRepo, technicianRepo, cornerRepo, userRepo, companyRepo, issueTypeRepo, eventBus, cache, logger, tracing, deviceService),
            inject: [INCIDENT_REPOSITORY, SLOT_REPOSITORY, TECHNICIAN_REPOSITORY, CORNER_REPOSITORY, USER_REPOSITORY, COMPANY_REPOSITORY, ISSUE_TYPE_REPOSITORY, EVENT_BUS, CACHE, LoggerService, TracingService, DEVICE_SERVICE],
        },
        {
            provide: AVAILABILITY_SERVICE,
            useFactory: (cornerRepo, slotRepo, technicianRepo, incidentRepo, cache) =>
                new AvailabilityService(cornerRepo, slotRepo, technicianRepo, incidentRepo, cache),
            inject: [CORNER_REPOSITORY, SLOT_REPOSITORY, TECHNICIAN_REPOSITORY, INCIDENT_REPOSITORY, CACHE],
        },
        {
            provide: REQUEST_SERVICE,
            useFactory: (requestRepo, technicianRepo, userRepo, cornerRepo, companyRepo, issueTypeRepo, eventBus, deviceService, tracing) =>
                new RequestService(requestRepo, technicianRepo, userRepo, cornerRepo, companyRepo, issueTypeRepo, eventBus, deviceService, tracing),
            inject: [REQUEST_REPOSITORY, TECHNICIAN_REPOSITORY, USER_REPOSITORY, CORNER_REPOSITORY, COMPANY_REPOSITORY, ISSUE_TYPE_REPOSITORY, EVENT_BUS, DEVICE_SERVICE, TracingService],
        },
        {
            provide: CORNER_SERVICE,
            useFactory: (cornerRepo, scheduleRepo, eventBus) =>
                new CornerService(cornerRepo, scheduleRepo, eventBus),
            inject: [CORNER_REPOSITORY, SCHEDULE_REPOSITORY, EVENT_BUS],
        },
        {
            provide: SCHEDULE_SERVICE,
            useFactory: (scheduleRepo, cornerRepo, technicianRepo, slotRepo, eventBus, holidayProvider) =>
                new ScheduleService(scheduleRepo, cornerRepo, technicianRepo, slotRepo, eventBus, holidayProvider),
            inject: [SCHEDULE_REPOSITORY, CORNER_REPOSITORY, TECHNICIAN_REPOSITORY, SLOT_REPOSITORY, EVENT_BUS, HOLIDAY_PROVIDER],
        },
        {
            provide: TECHNICIAN_SERVICE,
            useFactory: (technicianRepo, cornerRepo, eventBus) =>
                new TechnicianService(technicianRepo, cornerRepo, eventBus),
            inject: [TECHNICIAN_REPOSITORY, CORNER_REPOSITORY, EVENT_BUS],
        },
        {
            provide: LOCKER_SERVICE,
            useFactory: (lockerRepo, cornerRepo, incidentRepo) =>
                new LockerService(lockerRepo, cornerRepo, incidentRepo),
            inject: [LOCKER_REPOSITORY, CORNER_REPOSITORY, INCIDENT_REPOSITORY],
        },
        {
            provide: DEVICE_SERVICE,
            useFactory: (deviceRepo, inventoryService, incidentRepo) => new DeviceService(deviceRepo, inventoryService, incidentRepo),
            inject: [DEVICE_REPOSITORY, EXTERNAL_INVENTORY_SERVICE, INCIDENT_REPOSITORY],
        },
        {
            provide: USER_SERVICE,
            useFactory: (userRepo) => new UserService(userRepo),
            inject: [USER_REPOSITORY],
        },
        {
            provide: COMPANY_SERVICE,
            useFactory: (companyRepo, treeRepo) =>
                new CompanyService(companyRepo, treeRepo),
            inject: [COMPANY_REPOSITORY, ISSUE_TYPE_TREE_REPOSITORY],
        },
        {
            provide: SERVICENOW_PROFILE_SERVICE,
            useFactory: (profileRepo) => new ServiceNowProfileService(profileRepo),
            inject: [SERVICE_NOW_PROFILE_REPOSITORY],
        },
        {
            provide: SERVICENOW_INTEGRATION_SERVICE,
            useFactory: (issueTypeRepo, cornerRepo, profileRepo, snClient, cornerIssueConfigRepo) =>
                new ServiceNowIntegrationService(issueTypeRepo, cornerRepo, profileRepo, snClient, cornerIssueConfigRepo),
            inject: [ISSUE_TYPE_REPOSITORY, CORNER_REPOSITORY, SERVICE_NOW_PROFILE_REPOSITORY, SERVICENOW_CLIENT, CORNER_ISSUE_CONFIG_REPOSITORY],
        },
        {
            provide: CORNER_ISSUE_CONFIG_SERVICE,
            useFactory: (repo) => new CompanyIssueConfigService(repo),
            inject: [CORNER_ISSUE_CONFIG_REPOSITORY],
        },
        {
            provide: SERVICENOW_GROUP_SERVICE,
            useFactory: (repo) => new ServiceNowGroupService(repo),
            inject: [SERVICENOW_GROUP_REPOSITORY],
        },
    ],
    exports: [
        ISSUE_TYPE_SERVICE,
        INCIDENT_SERVICE,
        AVAILABILITY_SERVICE,
        REQUEST_SERVICE,
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
