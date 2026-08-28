// core/services/technician/technician.service.ts
import { Injectable } from '@nestjs/common';
import { ITechnicianService, CreateTechnicianCommand, UpdateTechnicianCommand } from '../../ports/incoming/technician/technician-service.port';
import { ITechnicianRepository } from '../../ports/outgoing/repositories/technician-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { IEventBus } from '../../ports/outgoing/event-bus/event-bus.port';
import { DomainEvent } from '@app/shared/domain-event';
import { Result } from '@app/result';
import { Technician } from '../../domain/entities/technician.entity';
import { TechnicianId, CornerId, UserId } from '../../domain/value-objects/ids';
import { DomainError } from '../../domain/errors/domain-error';
import { TracingService } from '@app/observability';

@Injectable()
export class TechnicianService implements ITechnicianService {
    constructor(
        private readonly technicianRepo: ITechnicianRepository,
        private readonly cornerRepo: ICornerRepository,
        private readonly eventBus: IEventBus,
        private readonly tracing: TracingService,
    ) { }

    async createTechnician(command: CreateTechnicianCommand): Promise<Result<Technician>> {
        return this.tracing.run(
            'micorner.createTechnician',
            { kind: 'server', attributes: { 'technician.name': command.name } },
            () => this._createTechnician(command),
        );
    }

    private async _createTechnician(command: CreateTechnicianCommand): Promise<Result<Technician>> {
        // Validar corner si se proporcionó
        let cornerId: CornerId | null = null;
        if (command.cornerId) {
            const cornerResult = await this.cornerRepo.findById(CornerId(command.cornerId));
            if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
            const corner = cornerResult.unwrap();
            if (!corner) {
                return Result.err(new Error(`Corner ${command.cornerId} not found`));
            }
            cornerId = CornerId(command.cornerId as any);
        }

        const technicianId = crypto.randomUUID() as unknown as TechnicianId;
        const technicianResult = Technician.create(
            technicianId,
            command.name,
            command.email,
            cornerId,
            command.lastName ?? null,
            command.userId ? UserId(command.userId as any) : null,
        );
        if (technicianResult.isFailure) return technicianResult;

        const technician = technicianResult.unwrap();

        const saveResult = await this.technicianRepo.save(technician);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        await this.eventBus.publish(new DomainEvent('TECHNICIAN_CREATED', technicianId.toString(), 'Technician', {
            name: command.name, email: command.email,
        }));

        return Result.ok(technician);
    }

    async updateTechnician(id: TechnicianId, command: UpdateTechnicianCommand): Promise<Result<Technician>> {
        return this.tracing.run(
            'micorner.updateTechnician',
            { kind: 'server', attributes: { 'technician.id': `${id}` } },
            () => this._updateTechnician(id, command),
        );
    }

    private async _updateTechnician(id: TechnicianId, command: UpdateTechnicianCommand): Promise<Result<Technician>> {
        const techResult = await this.technicianRepo.findById(id);
        if (techResult.isFailure) return Result.err(techResult.unwrapError());
        const technician = techResult.unwrap();
        if (!technician) {
            return Result.err(new Error(`Technician ${id} not found`));
        }

        // Actualizar campos
        let newCornerId: CornerId | null = technician.cornerId;
        if (command.cornerId) {
            const cornerResult = await this.cornerRepo.findById(CornerId(command.cornerId));
            if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
            if (!cornerResult.unwrap()) {
                return Result.err(new Error(`Corner ${command.cornerId} not found`));
            }
            newCornerId = CornerId(command.cornerId as any);
        }

        technician.update(
            command.name ?? technician.name,
            command.lastName !== undefined ? command.lastName : technician.lastName,
            command.fullName ?? technician.fullName,
            command.email ?? technician.email,
            newCornerId,
        );

        const updateResult = await this.technicianRepo.update(technician);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(technician);
    }

    async disableTechnician(id: string): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.disableTechnician',
            { kind: 'server', attributes: { 'technician.id': id } },
            () => this._disableTechnician(id),
        );
    }

    private async _disableTechnician(id: string): Promise<Result<void>> {
        const techResult = await this.technicianRepo.findById(TechnicianId(id));
        if (techResult.isFailure) return Result.err(techResult.unwrapError());
        const technician = techResult.unwrap();
        if (!technician) {
            return Result.err(new Error(`Technician ${id} not found`));
        }
        technician.disable();
        const updateResult = await this.technicianRepo.update(technician);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());
        return Result.ok(undefined);
    }

    async enableTechnician(id: TechnicianId): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.enableTechnician',
            { kind: 'server', attributes: { 'technician.id': `${id}` } },
            () => this._enableTechnician(id),
        );
    }

    private async _enableTechnician(id: TechnicianId): Promise<Result<void>> {
        const techResult = await this.technicianRepo.findById(id);

        if (techResult.isFailure) return Result.err(techResult.unwrapError());

        const technician = techResult.unwrap();

        if (!technician) {
            return Result.err(new Error(`Technician ${id} not found`));
        }

        technician.enable();
        const updateResult = await this.technicianRepo.update(technician);

        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(undefined);
    }

    async deleteTechnician(id: string): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.deleteTechnician',
            { kind: 'server', attributes: { 'technician.id': id } },
            () => this._deleteTechnician(id),
        );
    }

    private async _deleteTechnician(id: string): Promise<Result<void>> {
        const techResult = await this.technicianRepo.findById(TechnicianId(id));
        if (techResult.isFailure) return Result.err(techResult.unwrapError());
        const technician = techResult.unwrap();
        if (!technician) return Result.err(new Error(`Technician ${id} not found`));
        // No se puede despromover mientras siga asignado a un corner: quedaría
        // contando en la disponibilidad (horarios/slots) de un corner sin poder
        // atenderla. Primero hay que retirarlo del corner.
        if (technician.cornerId) {
            return Result.err(new Error('No se puede quitar de técnicos mientras esté asignado a un corner. Retiralo del corner primero.'));
        }
        // Soft-delete: el registro debe permanecer por integridad referencial con incident_timeline.
        // Desvinculamos el usuario y deshabilitamos para que no aparezca en listas activas.
        technician.disable();
        technician.unlinkUser();
        return this.technicianRepo.update(technician);
    }

    async getTechnician(id: TechnicianId): Promise<Result<Technician | null>> {
        return this.technicianRepo.findById(id);
    }

    async getAllTechnicians(): Promise<Result<Technician[]>> {
        return this.technicianRepo.findAll();
    }

    async getTechniciansByCorner(cornerId: CornerId): Promise<Result<Technician[]>> {
        return this.technicianRepo.findByCorner(cornerId);
    }

    async getTechnicianByUserId(userId: string): Promise<Result<Technician | null>> {
        return this.technicianRepo.findByUserId(userId);
    }
}
