// infrastructure/persistence/typeorm/repositories/corner.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { ICornerRepository } from '../../../../core/ports/outgoing/repositories/corner-repository.port';
import { CornerEntity } from '../entities/corner.entity';
import { Corner } from '../../../../core/domain/entities/corner.entity';
import { CornerId } from '../../../../core/domain/value-objects/ids';
import { DayOfWeek } from '../../../../core/domain/enums/day-of-week.enum';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmCornerRepository implements ICornerRepository {
    constructor(
        @InjectRepository(CornerEntity)
        private readonly repo: Repository<CornerEntity>,
    ) { }

    /**
     * Guarda un corner en la base de datos.
     * @example
     * ```typescript
     * const corner = Corner.create({
     *     name: 'Corner 1',
     *     slotDurationMinutes: 30,
     *     onlyTechnicians: false,
     *     isActive: true,
     *     clientName: 'Client 1',
     *     description: 'Description 1',
     *     servicenowLocation: 'ServiceNow Location 1',
     *     latitude: 1,
     *     longitude: 1,
     *     schedules: [],
     * });
     * const result = await this.cornerRepository.save(corner);
     * ```
     * @param corner El corner a guardar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async save(corner: Corner): Promise<Result<void>> {
        try {
            const entity = this.toEntity(corner);
            await this.repo.save(entity);
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Busca un corner por su ID.
     * @example
     * ```typescript
     * const corner = await this.cornerRepository.findById('corner-1');
     * ```
     * @param id El ID del corner a buscar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async findById(id: CornerId | string): Promise<Result<Corner | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { corner_id: id.toString() },
                relations: ['schedules', 'technicians', 'lockers'],
            });
            if (!entity) return Result.ok(null);
            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Busca un corner por su nombre.
     * @example
     * ```typescript
     * const corner = await this.cornerRepository.findByName('Corner 1');
     * ```
     * @param name El nombre del corner a buscar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async findByName(name: string): Promise<Result<Corner | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { name },
                relations: ['schedules', 'technicians', 'lockers'],
            });
            if (!entity) return Result.ok(null);
            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Busca todos los corners activos.
     * @example
     * ```typescript
     * const corners = await this.cornerRepository.findAllActive();
     * ```
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async findAllActive(): Promise<Result<Corner[]>> {
        try {
            const entities = await this.repo.find({
                where: { is_active: true },
                relations: ['schedules', 'technicians', 'lockers'],
                order: { name: 'ASC' },
            });
            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Actualiza un corner en la base de datos.
     * @example
     * ```typescript
     * const corner = Corner.create({
     *     name: 'Corner 1',
     *     slotDurationMinutes: 30,
     *     onlyTechnicians: false,
     *     isActive: true,
     *     clientName: 'Client 1',
     *     description: 'Description 1',
     *     servicenowLocation: 'ServiceNow Location 1',
     *     latitude: 1,
     *     longitude: 1,
     *     schedules: [],
     * });
     * const result = await this.cornerRepository.update(corner);
     * ```
     * @param corner El corner a actualizar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async update(corner: Corner): Promise<Result<void>> {
        try {
            const entity = this.toEntity(corner);
            await this.repo.update(
                { corner_id: entity.corner_id },
                {
                    name: entity.name,
                    client_name: entity.client_name,
                    description: entity.description,
                    servicenow_location: entity.servicenow_location,
                    snow_assignment_group: entity.snow_assignment_group,
                    latitude: entity.latitude,
                    longitude: entity.longitude,
                    only_technicians: entity.only_technicians,
                    is_active: entity.is_active,
                    timezone: entity.timezone,
                    country: entity.country,
                    city: entity.city,
                    updated_at: entity.updated_at,
                }
            );

            // Actualizar schedules (simplificado - en producción usaría una relación)
            // ...

            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Elimina un corner de la base de datos.
     * @example
     * ```typescript
     * const result = await this.cornerRepository.delete('corner-1');
     * ```
     * @param id El ID del corner a eliminar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async delete(id: CornerId | string): Promise<Result<void>> {
        try {
            // Soft delete
            await this.repo.update(
                { corner_id: id.toString() },
                { is_active: false, updated_at: new Date() }
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Busca corners por ubicación de ServiceNow.
     * @example
     * ```typescript
     * const corners = await this.cornerRepository.findByServiceNowLocation('ServiceNow Location 1');
     * ```
     * @param location La ubicación de ServiceNow a buscar.
     * @returns Un resultado que indica si la operación fue exitosa.
     */
    async findByServiceNowLocation(location: string): Promise<Result<Corner[]>> {
        try {
            const entities = await this.repo.find({
                where: { servicenow_location: Like(`%${location}%`), is_active: true },
                relations: ['schedules', 'technicians', 'lockers'],
            });
            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    /**
     * Convierte un corner de dominio a entidad.
     * @param domain El corner de dominio.
     * @returns La entidad del corner.
     */
    private toEntity(domain: Corner): CornerEntity {
        const entity = new CornerEntity();
        entity.corner_id = domain.id.toString();
        entity.name = domain.name;
        entity.client_name = domain.clientName;
        entity.description = domain.description;
        entity.servicenow_location = domain.servicenowLocation;
        entity.snow_assignment_group = domain.snowAssignmentGroup;
        entity.latitude = domain.latitude;
        entity.longitude = domain.longitude;
        entity.only_technicians = domain.onlyTechnicians;
        entity.is_active = domain.isActive;
        entity.timezone = domain.timezone;
        entity.country = domain.country;
        entity.city = domain.city;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;

        // Nota: Las schedules se manejan por separado en una tabla
        return entity;
    }

    /**
     * Convierte una entidad de corner a corner de dominio.
     * @param entity La entidad del corner.
     * @returns El corner de dominio.
     */
    private toDomain(entity: CornerEntity): Corner {
        // Reconstruir schedules desde la relación (si existe)
        const schedules = entity.schedules?.map(s => ({
            dayOfWeek: s.day_of_week as DayOfWeek,
            startTime: s.start_time,
            endTime: s.end_time
        })) || [];

        return Corner.reconstitute(
            CornerId(entity.corner_id),
            entity.name,
            entity.only_technicians,
            entity.is_active,
            entity.client_name,
            entity.description,
            entity.servicenow_location,
            entity.snow_assignment_group,
            entity.latitude,
            entity.longitude,
            schedules,
            entity.timezone ?? 'UTC',
            entity.country ?? 'AR',
            entity.city ?? null,
            entity.created_at,
            entity.updated_at
        );
    }
}