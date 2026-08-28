// core/services/corner/corner.service.ts
import { Injectable } from '@nestjs/common';
import { ICornerService, CreateCornerCommand, UpdateCornerCommand, AddScheduleCommand } from '../../ports/incoming/corner/corner-service.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { IScheduleRepository } from '../../ports/outgoing/repositories/schedule-repository.port';
import { IEventBus } from '../../ports/outgoing/event-bus/event-bus.port';
import { DomainEvent } from '@app/shared/domain-event';
import { Result } from '@app/result';
import { Corner } from '../../domain/entities/corner.entity';
import { CornerId, ScheduleId } from '../../domain/value-objects/ids';
import { TracingService } from '@app/observability';

@Injectable()
export class CornerService implements ICornerService {
    constructor(
        private readonly cornerRepo: ICornerRepository,
        private readonly scheduleRepo: IScheduleRepository,
        private readonly eventBus: IEventBus,
        private readonly tracing: TracingService,
    ) { }

    async createCorner(command: CreateCornerCommand): Promise<Result<Corner>> {
        return this.tracing.run(
            'micorner.createCorner',
            { kind: 'server', attributes: { 'corner.name': command.name } },
            () => this._createCorner(command),
        );
    }

    private async _createCorner(command: CreateCornerCommand): Promise<Result<Corner>> {
        const code = (command.code?.trim() || this.slugify(command.name)).toLowerCase();

        const existingResult = await this.cornerRepo.findByCode(code);
        if (existingResult.isFailure) return Result.err(existingResult.unwrapError());
        if (existingResult.unwrap()) {
            return Result.err(new Error(`Corner code '${code}' ya está en uso`));
        }

        const cornerId = crypto.randomUUID() as unknown as CornerId;
        const cornerResult = Corner.create(
            cornerId,
            command.name,
            code,
            command.onlyTechnicians ?? false,
        );
        if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
        const corner = cornerResult.unwrap();

        if (command.clientName) corner.updateInfo(undefined, command.clientName);

        const saveResult = await this.cornerRepo.save(corner);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        await this.eventBus.publish(new DomainEvent('CORNER_CREATED', cornerId.toString(), 'Corner', { name: command.name }));

        return Result.ok(corner);
    }

    async updateCorner(id: string, command: UpdateCornerCommand): Promise<Result<Corner>> {
        return this.tracing.run(
            'micorner.updateCorner',
            { kind: 'server', attributes: { 'corner.id': id } },
            () => this._updateCorner(id, command),
        );
    }

    private async _updateCorner(id: string, command: UpdateCornerCommand): Promise<Result<Corner>> {
        const cornerResult = await this.cornerRepo.findById(CornerId(id));
        if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
        const corner = cornerResult.unwrap();
        if (!corner) {
            return Result.err(new Error(`Corner ${id} not found`));
        }

        // Actualizar campos
        corner.updateInfo(
            command.name,
            command.clientName,
            command.description,
            command.servicenowLocation,
            command.latitude,
            command.longitude,
            undefined,
            command.timezone,
            command.country,
            command.city,
        );
        if (command.onlyTechnicians !== undefined) corner.updateOperationalConfig(command.onlyTechnicians);
        if (command.isActive !== undefined) {
            if (command.isActive) corner.activate(); else corner.deactivate();
        }

        if (command.code !== undefined) {
            const newCode = command.code.trim().toLowerCase();
            if (newCode !== corner.code) {
                const existingResult = await this.cornerRepo.findByCode(newCode);
                if (existingResult.isFailure) return Result.err(existingResult.unwrapError());
                const existing = existingResult.unwrap();
                if (existing && existing.id.toString() !== corner.id.toString()) {
                    return Result.err(new Error(`Corner code '${newCode}' ya está en uso`));
                }
                const codeResult = corner.updateCode(newCode);
                if (codeResult.isFailure) return Result.err(codeResult.unwrapError());
            }
        }

        const updateResult = await this.cornerRepo.update(corner);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(corner);
    }

    async getCorner(id: string): Promise<Result<Corner | null>> {
        return this.cornerRepo.findById(CornerId(id));
    }

    async getAllActiveCorners(): Promise<Result<Corner[]>> {
        return this.cornerRepo.findAllActive();
    }

    async addSchedule(command: AddScheduleCommand): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.addSchedule',
            { kind: 'server', attributes: { 'corner.cornerId': command.cornerId } },
            () => this._addSchedule(command),
        );
    }

    private async _addSchedule(command: AddScheduleCommand): Promise<Result<void>> {
        const cornerResult = await this.cornerRepo.findById(CornerId(command.cornerId));
        if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
        const corner = cornerResult.unwrap();
        if (!corner) {
            return Result.err(new Error(`Corner ${command.cornerId} not found`));
        }

        corner.addSchedule({
            dayOfWeek: command.dayOfWeek,
            startTime: command.startTime,
            endTime: command.endTime,
        });

        const updateResult = await this.cornerRepo.update(corner);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(undefined);
    }

    async removeSchedule(scheduleId: string): Promise<Result<void>> {
        return this.tracing.run(
            'micorner.removeSchedule',
            { kind: 'server', attributes: { 'corner.scheduleId': scheduleId } },
            () => this._removeSchedule(scheduleId),
        );
    }

    private static readonly ACCENT_MAP: Record<string, string> = {
        á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
    };

    /** Deriva un code (slug snake_case) a partir del nombre cuando no se provee uno explícito. */
    private slugify(name: string): string {
        const withoutAccents = name
            .toLowerCase()
            .split('')
            .map(ch => CornerService.ACCENT_MAP[ch] ?? ch)
            .join('');
        return withoutAccents
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    private async _removeSchedule(scheduleId: string): Promise<Result<void>> {
        // Necesitamos buscar el corner que contiene este schedule
        // Podríamos tener un repositorio de schedules directamente
        const scheduleResult = await this.scheduleRepo.findById(ScheduleId(scheduleId));
        if (scheduleResult.isFailure) return Result.err(scheduleResult.unwrapError());
        const schedule = scheduleResult.unwrap();
        if (!schedule) {
            return Result.err(new Error(`Schedule ${scheduleId} not found`));
        }

        // Eliminar la schedule (soft delete o realmente borrar)
        await this.scheduleRepo.delete(scheduleId);

        return Result.ok(undefined);
    }
}
