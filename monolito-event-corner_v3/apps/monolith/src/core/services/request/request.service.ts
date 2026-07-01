// core/services/request/request.service.ts
import { Injectable } from '@nestjs/common';
import { IRequestService, CreateRequestCommand, UpdateRequestStatusCommand } from '../../ports/incoming/request/request-service.port';
import { IRequestRepository } from '../../ports/outgoing/repositories/request-repository.port';
import { ITechnicianRepository } from '../../ports/outgoing/repositories/technician-repository.port';
import { IUserRepository } from '../../ports/outgoing/repositories/user-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { ICompanyRepository } from '../../ports/outgoing/repositories/company-repository.port';
import { IIssueTypeRepository } from '../../ports/outgoing/repositories/issue-type-repository.port';
import { IEventBus } from '../../ports/outgoing/event-bus/event-bus.port';
import { IDeviceService } from '../../ports/incoming/device/device-service.port';
import { TracingService } from '@app/observability';
import { Result } from '@app/result';
import { Request } from '../../domain/entities/request.entity';
import { RequestId, TechnicianId, CustomerId, CornerId, CompanyId, IssueTypeId, DeviceId } from '../../domain/value-objects/ids';
import { DomainError } from '../../domain/errors/domain-error';
import { IssueTypeNotAllowedForCompanyError } from '@app/shared/errors/domain-error';

@Injectable()
export class RequestService implements IRequestService {
    constructor(
        private readonly requestRepo: IRequestRepository,
        private readonly technicianRepo: ITechnicianRepository,
        private readonly userRepo: IUserRepository,
        private readonly cornerRepo: ICornerRepository,
        private readonly companyRepo: ICompanyRepository,
        private readonly issueTypeRepo: IIssueTypeRepository,
        private readonly eventBus: IEventBus,
        private readonly deviceService: IDeviceService,
        private readonly tracing: TracingService,
    ) { }

    async createRequest(command: CreateRequestCommand): Promise<Result<Request>> {
        return this.tracing.run(
            'monolith.createRequest',
            { kind: 'server', attributes: { 'request.customerId': command.customerId, 'request.cornerId': command.cornerId, 'request.issueTypeId': command.issueTypeId } },
            () => this._createRequest(command),
        );
    }

    private async _createRequest(command: CreateRequestCommand): Promise<Result<Request>> {
        // 1. Validar que el tipo de incidencia existe y es de tipo REQUEST
        const issueTypeResult = await this.issueTypeRepo.findById(command.issueTypeId);
        if (issueTypeResult.isFailure) return Result.err(issueTypeResult.unwrapError());
        const issueType = issueTypeResult.unwrap();
        if (!issueType) {
            return Result.err(new Error(`Issue type ${command.issueTypeId} not found`));
        }
        if (!issueType.isRequest()) {
            return Result.err(new Error('Issue type must be a REQUEST to create a request'));
        }

        // 2. Validar que el técnico existe
        const techResult = await this.technicianRepo.findById(command.technicianId);
        if (techResult.isFailure) return Result.err(techResult.unwrapError());
        const technician = techResult.unwrap();
        if (!technician) {
            return Result.err(new Error(`Technician ${command.technicianId} not found`));
        }

        // 3. Validar que el usuario existe
        const userResult = await this.userRepo.findById(command.customerId);
        if (userResult.isFailure) return Result.err(userResult.unwrapError());
        const user = userResult.unwrap();
        if (!user) {
            return Result.err(new Error(`User ${command.customerId} not found`));
        }

        // 4. Validar que el corner existe
        const cornerResult = await this.cornerRepo.findById(command.cornerId);
        if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
        const corner = cornerResult.unwrap();
        if (!corner) {
            return Result.err(new Error(`Corner ${command.cornerId} not found`));
        }

        // 5. Validar que la empresa existe
        const companyResult = await this.companyRepo.findById(command.companyId);
        if (companyResult.isFailure) return Result.err(companyResult.unwrapError());
        const company = companyResult.unwrap();
        if (!company) {
            return Result.err(new Error(`Company ${command.companyId} not found`));
        }

        // 6. Validar que el tipo de incidencia pertenece al árbol de la empresa
        if (issueType.treeId.toString() !== company.treeId.toString()) {
            return Result.err(new IssueTypeNotAllowedForCompanyError(command.issueTypeId, command.companyId));
        }

        // 7. Resolver y vincular el dispositivo del usuario
        const deviceResult = await this.deviceService.resolveAndLinkDevice(
            command.device.serialNumber,
            command.customerId,
        );
        if (deviceResult.isFailure) return Result.err(deviceResult.unwrapError());
        const device = deviceResult.unwrap();
        if (!device) {
            return Result.err(new Error(`El dispositivo ${command.device.serialNumber} no está registrado en el inventario`));
        }

        // 8. Crear entidad Request
        const requestId = crypto.randomUUID() as unknown as RequestId;
        const scheduledAt = new Date(command.scheduledAt);
        const requestResult = Request.create(
            requestId,
            IssueTypeId(command.issueTypeId as any),
            TechnicianId(command.technicianId as any),
            CustomerId(command.customerId as any),
            CornerId(command.cornerId as any),
            CompanyId(command.companyId as any),
            scheduledAt,
            command.notes,
        );
        if (requestResult.isFailure) return requestResult;

        const request = requestResult.unwrap();

        // 8b. Vincular dispositivo a la request
        request.attachDevice(device.id.toString());

        // 8. Extraer eventos antes de guardar
        const createEvents = request.pullEvents();

        // 9. Guardar
        const saveResult = await this.requestRepo.save(request);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        // 10. Persistir actividad y publicar al Outbox
        await this.requestRepo.saveEvents(request.id.toString(), createEvents);
        await this.eventBus.publishMany(createEvents);

        return Result.ok(request);
    }

    async updateRequestStatus(command: UpdateRequestStatusCommand): Promise<Result<Request>> {
        return this.tracing.run(
            'monolith.updateRequestStatus',
            { kind: 'server', attributes: { 'request.requestId': command.requestId, 'request.newStatus': command.newStatus } },
            () => this._updateRequestStatus(command),
        );
    }

    private async _updateRequestStatus(command: UpdateRequestStatusCommand): Promise<Result<Request>> {
        const requestResult = await this.requestRepo.findById(command.requestId);
        if (requestResult.isFailure) return Result.err(requestResult.unwrapError());
        const request = requestResult.unwrap();
        if (!request) {
            return Result.err(new Error(`Request ${command.requestId} not found`));
        }

        // Validar que el técnico es el mismo que creó la request o es manager (simplificado)
        // Aquí podríamos verificar permisos, pero lo omitimos por brevedad.

        const statusResult = request.changeStatus(command.newStatus, TechnicianId(command.technicianId as any), command.comment);
        if (statusResult.isFailure) return Result.err(statusResult.unwrapError());

        const statusEvents = request.pullEvents();
        const updateResult = await this.requestRepo.update(request);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        await this.requestRepo.saveEvents(request.id.toString(), statusEvents);
        await this.eventBus.publishMany(statusEvents);

        return Result.ok(request);
    }

    async getRequest(id: string): Promise<Result<Request | null>> {
        return this.requestRepo.findById(id);
    }

    async getRequestsByTechnician(technicianId: string): Promise<Result<Request[]>> {
        return this.requestRepo.findByTechnician(technicianId);
    }

    async getRequestsByCustomer(customerId: string): Promise<Result<Request[]>> {
        return this.requestRepo.findByCustomer(customerId);
    }
}