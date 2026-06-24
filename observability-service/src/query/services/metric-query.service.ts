import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricPointEntity } from '../../persistence/entities/metric-point.entity';
import { QueryMetricsDto } from '../dto/query-metrics.dto';

@Injectable()
export class MetricQueryService {
    constructor(
        @InjectRepository(MetricPointEntity) private readonly repo: Repository<MetricPointEntity>,
    ) { }

    async names(): Promise<string[]> {
        const rows = await this.repo
            .createQueryBuilder('m')
            .select('DISTINCT m.name', 'name')
            .orderBy('m.name', 'ASC')
            .getRawMany<{ name: string }>();
        return rows.map(r => r.name).filter(Boolean);
    }

    async services(): Promise<string[]> {
        const rows = await this.repo
            .createQueryBuilder('m')
            .select('DISTINCT m.service', 'service')
            .orderBy('m.service', 'ASC')
            .getRawMany<{ service: string }>();
        return rows.map(r => r.service).filter(Boolean);
    }

    async query(dto: QueryMetricsDto): Promise<{ data: MetricPointEntity[]; total: number }> {
        const qb = this.repo.createQueryBuilder('m').orderBy('m.timestamp', 'DESC');

        if (dto.name) qb.andWhere('m.name LIKE :name', { name: `%${dto.name}%` });
        if (dto.service) qb.andWhere('m.service = :service', { service: dto.service });
        if (dto.correlationId) qb.andWhere('m.correlationId = :correlationId', { correlationId: dto.correlationId });
        if (dto.from) qb.andWhere('m.timestamp >= :from', { from: new Date(dto.from) });
        if (dto.to) qb.andWhere('m.timestamp <= :to', { to: new Date(dto.to) });

        const [data, total] = await qb
            .skip(dto.offset ?? 0)
            .take(dto.limit ?? 100)
            .getManyAndCount();

        return { data, total };
    }
}
