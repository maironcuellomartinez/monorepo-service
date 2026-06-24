import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ILockerRepository } from '../../../../core/ports/outgoing/repositories/locker-repository.port';
import { LockerEntity } from '../entities/locker.entity';
import { LockerId, CornerId } from '../../../../core/domain/value-objects/ids';
import { Result } from '@app/result';
import { Locker } from '@app/core/domain/entities/locker.entity';
import { LockerStatus } from '@app/core/domain/enums/locker-status.enum';

@Injectable()
export class TypeOrmLockerRepository implements ILockerRepository {
    constructor(
        @InjectRepository(LockerEntity)
        private readonly repo: Repository<LockerEntity>,
    ) { }

    async save(locker: Locker): Promise<Result<void>> {
        try {
            const entity = this.toEntity(locker);
            await this.repo.save(entity);
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findById(id: LockerId | string): Promise<Result<Locker | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { locker_id: id.toString() },
                relations: ['corner'],
            });
            if (!entity) return Result.ok(null);
            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCorner(cornerId: string | CornerId): Promise<Result<Locker[]>> {
        try {
            const entities = await this.repo.find({
                where: { corner_id: cornerId.toString() },
                relations: ['corner'],
                order: { locker_code: 'ASC' },
            });
            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCode(lockerCode: string): Promise<Result<Locker | null>> {
        try {
            const entity = await this.repo.findOne({
                where: { locker_code: lockerCode },
                relations: ['corner'],
            });
            if (!entity) return Result.ok(null);
            const domain = this.toDomain(entity);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findAvailableByCorner(cornerId: string): Promise<Result<Locker[]>> {
        try {
            const entities = await this.repo.find({
                where: {
                    corner_id: cornerId,
                    status: LockerStatus.AVAILABLE,
                },
                relations: ['corner'],
                order: { locker_code: 'ASC' },
            });
            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByStatus(cornerId: string, status: LockerStatus): Promise<Result<Locker[]>> {
        try {
            const entities = await this.repo.find({
                where: {
                    corner_id: cornerId,
                    status,
                },
                relations: ['corner'],
                order: { locker_code: 'ASC' },
            });
            const domains = entities.map(e => this.toDomain(e));
            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async update(locker: Locker): Promise<Result<void>> {
        try {
            const entity = this.toEntity(locker);
            await this.repo.update(
                { locker_id: entity.locker_id },
                {
                    status: entity.status,
                    description: entity.description,
                    updated_at: entity.updated_at,
                }
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async delete(id: LockerId | string): Promise<Result<void>> {
        try {
            // Soft delete - marcar como out of service
            await this.repo.update(
                { locker_id: id.toString() },
                {
                    status: LockerStatus.OUT_OF_SERVICE,
                    updated_at: new Date()
                }
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    private toEntity(domain: Locker): LockerEntity {
        const entity = new LockerEntity();
        entity.locker_id = domain.id.toString();
        entity.corner_id = domain.cornerId.toString();
        entity.locker_code = domain.lockerCode;
        entity.status = domain.status;
        entity.description = domain.description;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;
        return entity;
    }

    private toDomain(entity: LockerEntity): Locker {
        return Locker.reconstitute(
            LockerId(entity.locker_id as any),
            CornerId(entity.corner_id as any),
            entity.locker_code,
            entity.status as LockerStatus,
            entity.description,
            entity.created_at,
            entity.updated_at,
        );
    }
}