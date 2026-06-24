import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogEntryEntity } from '../../persistence/entities/log-entry.entity';
import { QueryLogsDto } from '../dto/query-logs.dto';

@Injectable()
export class LogQueryService {
    constructor(
        @InjectRepository(LogEntryEntity) private readonly repo: Repository<LogEntryEntity>,
    ) { }

    async services(): Promise<string[]> {
        const rows = await this.repo
            .createQueryBuilder('l')
            .select('DISTINCT l.service', 'service')
            .orderBy('l.service', 'ASC')
            .getRawMany<{ service: string }>();
        return rows.map(r => r.service).filter(Boolean);
    }

    async query(dto: QueryLogsDto): Promise<{ data: LogEntryEntity[]; total: number }> {
        const qb = this.repo.createQueryBuilder('l').orderBy('l.timestamp', 'DESC');

        if (dto.service) qb.andWhere('l.service = :service', { service: dto.service });
        if (dto.level) qb.andWhere('l.level = :level', { level: dto.level });
        if (dto.correlationId) qb.andWhere('l.correlationId = :correlationId', { correlationId: dto.correlationId });
        if (dto.traceId) qb.andWhere('l.traceId = :traceId', { traceId: dto.traceId });
        if (dto.from) qb.andWhere('l.timestamp >= :from', { from: new Date(dto.from) });
        if (dto.to) qb.andWhere('l.timestamp <= :to', { to: new Date(dto.to) });
        if (dto.search) qb.andWhere('l.message LIKE :search', { search: `%${dto.search}%` });

        const [data, total] = await qb
            .skip(dto.offset ?? 0)
            .take(dto.limit ?? 100)
            .getManyAndCount();

        return { data, total };
    }
}
