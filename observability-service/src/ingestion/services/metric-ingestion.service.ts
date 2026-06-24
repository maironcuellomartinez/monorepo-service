import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricPointEntity } from '../../persistence/entities/metric-point.entity';
import { FORWARDERS, IForwarder } from '../../forwarding/forwarder.interface';
import { IngestMetricsDto } from '../dto/ingest-metrics.dto';

@Injectable()
export class MetricIngestionService {
    constructor(
        @InjectRepository(MetricPointEntity)
        private readonly repo: Repository<MetricPointEntity>,
        @Inject(FORWARDERS)
        private readonly forwarders: IForwarder[],
    ) {}

    async ingest(dto: IngestMetricsDto): Promise<{ saved: number }> {
        const entities = dto.metrics.map((m) => {
            const e = new MetricPointEntity();
            e.name = m.name;
            e.service = m.service;
            e.value = m.value;
            e.unit = m.unit ?? null;
            e.type = m.type;
            e.labels = m.labels ?? null;
            e.correlationId = m.correlationId ?? null;
            e.timestamp = new Date(m.timestamp);
            return e;
        });

        await this.repo.save(entities, { chunk: 100 });

        for (const fwd of this.forwarders) {
            fwd.forwardMetrics(dto.metrics).catch(() => {});
        }

        return { saved: entities.length };
    }
}
