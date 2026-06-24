import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogEntryEntity } from '../../persistence/entities/log-entry.entity';
import { FORWARDERS, IForwarder } from '../../forwarding/forwarder.interface';
import { IngestLogsDto } from '../dto/ingest-logs.dto';

@Injectable()
export class LogIngestionService {
    constructor(
        @InjectRepository(LogEntryEntity) private readonly repo: Repository<LogEntryEntity>,
        @Inject(FORWARDERS) private readonly forwarders: IForwarder[],
    ) { }

    async ingest(dto: IngestLogsDto): Promise<{ saved: number }> {
        const entities = dto.logs.map((l) => {
            const e = new LogEntryEntity();
            e.level = l.level;
            e.message = l.message;
            e.service = l.service;
            e.timestamp = new Date(l.timestamp);
            e.correlationId = l.correlationId ?? null;
            e.traceId = l.traceId ?? null;
            e.spanId = l.spanId ?? null;
            e.context = l.context ?? null;
            e.stack = l.stack ?? null;
            e.meta = l.meta ?? null;
            return e;
        });

        await this.repo.save(entities, { chunk: 100 });

        for (const fwd of this.forwarders) {
            fwd.forwardLogs(dto.logs).catch(() => { });
        }

        return { saved: entities.length };
    }
}
