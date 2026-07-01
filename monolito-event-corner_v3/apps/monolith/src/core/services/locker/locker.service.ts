// core/services/locker/locker.service.ts
import { Injectable } from '@nestjs/common';
import { ILockerService, CreateLockerCommand } from '../../ports/incoming/locker/locker-service.port';
import { ILockerRepository } from '../../ports/outgoing/repositories/locker-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { IIncidentRepository } from '../../ports/outgoing/repositories/incident-repository.port';
import { Result } from '@app/result';
import { Locker } from '../../domain/entities/locker.entity';
import { LockerId, CornerId, IncidentId } from '../../domain/value-objects/ids';
import { DomainError } from '../../domain/errors/domain-error';
import { LockerStatus } from '../../domain/enums/locker-status.enum';
import { TracingService } from '@app/observability';

@Injectable()
export class LockerService implements ILockerService {
    constructor(
        private readonly lockerRepo: ILockerRepository,
        private readonly cornerRepo: ICornerRepository,
        private readonly incidentRepo: IIncidentRepository,
        private readonly tracing: TracingService,
    ) { }

    async createLocker(command: CreateLockerCommand): Promise<Result<Locker>> {
        return this.tracing.run(
            'monolith.createLocker',
            { kind: 'server', attributes: { 'locker.cornerId': `${command.cornerId}` } },
            () => this._createLocker(command),
        );
    }

    private async _createLocker(command: CreateLockerCommand): Promise<Result<Locker>> {
        const cornerResult = await this.cornerRepo.findById(command.cornerId);
        if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());

        const corner = cornerResult.unwrap();
        if (!corner) {
            return Result.err(new Error(`Corner ${command.cornerId} not found`));
        }

        const lockerId = command.lockerId as LockerId; // asumimos que viene un ID manual
        const lockerResult = Locker.create(
            lockerId,
            CornerId(command.cornerId),
            command.lockerCode,
            command.description,
        );
        if (lockerResult.isFailure) return lockerResult;

        const locker = lockerResult.unwrap();
        const saveResult = await this.lockerRepo.save(locker);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        return Result.ok(locker);
    }

    async updateLockerStatus(id: LockerId, status: LockerStatus): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.updateLockerStatus',
            { kind: 'server', attributes: { 'locker.id': `${id}` } },
            () => this._updateLockerStatus(id, status),
        );
    }

    private async _updateLockerStatus(id: LockerId, status: LockerStatus): Promise<Result<void>> {
        const lockerResult = await this.lockerRepo.findById(id);
        if (lockerResult.isFailure) return Result.err(lockerResult.unwrapError());
        const locker = lockerResult.unwrap();
        if (!locker) {
            return Result.err(new Error(`Locker ${id} not found`));
        }

        locker.changeStatus(status);
        const updateResult = await this.lockerRepo.update(locker);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(undefined);
    }

    async assignLockerToIncident(lockerId: LockerId, incidentId: IncidentId): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.assignLockerToIncident',
            { kind: 'server', attributes: { 'locker.lockerId': `${lockerId}`, 'locker.incidentId': `${incidentId}` } },
            () => this._assignLockerToIncident(lockerId, incidentId),
        );
    }

    private async _assignLockerToIncident(lockerId: LockerId, incidentId: IncidentId): Promise<Result<void>> {
        const lockerResult = await this.lockerRepo.findById(lockerId);
        if (lockerResult.isFailure) return Result.err(lockerResult.unwrapError());
        const locker = lockerResult.unwrap();
        if (!locker) return Result.err(new Error(`Locker ${lockerId} not found`));

        const incidentResult = await this.incidentRepo.findById(incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());
        const incident = incidentResult.unwrap();
        if (!incident) return Result.err(new Error(`Incident ${incidentId} not found`));

        if (locker.cornerId.toString() !== incident.cornerId.toString()) {
            return Result.err(new Error('Locker does not belong to the incident corner'));
        }

        // Marcar locker como ocupado
        const occupyResult = locker.occupy();
        if (occupyResult.isFailure) return Result.err(occupyResult.unwrapError());

        // Registrar locker en la incidencia
        const assignResult = incident.assignLocker(lockerId);
        if (assignResult.isFailure) return Result.err(assignResult.unwrapError());

        // Persistir ambos
        const lockerUpdate = await this.lockerRepo.update(locker);
        if (lockerUpdate.isFailure) return Result.err(lockerUpdate.unwrapError());

        const incidentSave = await this.incidentRepo.save(incident);
        if (incidentSave.isFailure) return Result.err(incidentSave.unwrapError());

        return Result.ok(undefined);
    }

    async releaseLocker(lockerId: LockerId, incidentId: IncidentId): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.releaseLocker',
            { kind: 'server', attributes: { 'locker.lockerId': `${lockerId}`, 'locker.incidentId': `${incidentId}` } },
            () => this._releaseLocker(lockerId, incidentId),
        );
    }

    private async _releaseLocker(lockerId: LockerId, incidentId: IncidentId): Promise<Result<void>> {
        const lockerResult = await this.lockerRepo.findById(lockerId);
        if (lockerResult.isFailure) return Result.err(lockerResult.unwrapError());
        const locker = lockerResult.unwrap();
        if (!locker) return Result.err(new Error(`Locker ${lockerId} not found`));

        const incidentResult = await this.incidentRepo.findById(incidentId);
        if (incidentResult.isFailure) return Result.err(incidentResult.unwrapError());
        const incident = incidentResult.unwrap();
        if (!incident) return Result.err(new Error(`Incident ${incidentId} not found`));

        // Liberar locker en la incidencia
        const releaseFromIncident = incident.releaseLocker();
        if (releaseFromIncident.isFailure) return Result.err(releaseFromIncident.unwrapError());

        // Liberar el locker (status → AVAILABLE)
        const releaseResult = locker.release();
        if (releaseResult.isFailure) return Result.err(releaseResult.unwrapError());

        const lockerUpdate = await this.lockerRepo.update(locker);
        if (lockerUpdate.isFailure) return Result.err(lockerUpdate.unwrapError());

        const incidentSave = await this.incidentRepo.save(incident);
        if (incidentSave.isFailure) return Result.err(incidentSave.unwrapError());

        return Result.ok(undefined);
    }

    async getAvailableLockers(cornerId: CornerId): Promise<Result<Locker[]>> {
        return this.lockerRepo.findAvailableByCorner(cornerId);
    }
}
