import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TraceSpanEntity } from '../../persistence/entities/trace-span.entity';
import { QueryTracesDto } from '../dto/query-traces.dto';

@Injectable()
export class TraceQueryService {
    constructor(
        @InjectRepository(TraceSpanEntity) private readonly repo: Repository<TraceSpanEntity>,
    ) { }

    async services(): Promise<string[]> {
        const rows = await this.repo
            .createQueryBuilder('s')
            .select('DISTINCT s.serviceName', 'serviceName')
            .orderBy('s.serviceName', 'ASC')
            .getRawMany<{ serviceName: string }>();
        return rows.map(r => r.serviceName).filter(Boolean);
    }

    async query(dto: QueryTracesDto): Promise<{ data: TraceSpanEntity[]; total: number }> {
        const qb = this.repo.createQueryBuilder('s').orderBy('s.startTime', 'DESC');

        if (dto.traceId) qb.andWhere('s.traceId = :traceId', { traceId: dto.traceId });
        if (dto.correlationId) qb.andWhere('s.correlationId = :correlationId', { correlationId: dto.correlationId });
        if (dto.serviceName) qb.andWhere('s.serviceName = :serviceName', { serviceName: dto.serviceName });
        if (dto.name) qb.andWhere('s.name LIKE :name', { name: `%${dto.name}%` });
        if (dto.from) qb.andWhere('s.receivedAt >= :from', { from: new Date(dto.from) });
        if (dto.to) qb.andWhere('s.receivedAt <= :to', { to: new Date(dto.to) });

        const [data, total] = await qb
            .skip(dto.offset ?? 0)
            .take(dto.limit ?? 100)
            .getManyAndCount();

        return { data, total };
    }

    async getTrace(traceId: string): Promise<TraceSpanEntity[]> {
        return this.repo.find({
            where: { traceId },
            order: { startTime: 'ASC' },
        });
    }
}
