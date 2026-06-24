import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TraceSpanEntity } from '../../persistence/entities/trace-span.entity';
import { FORWARDERS, IForwarder } from '../../forwarding/forwarder.interface';
import { IngestTracesDto, ParsedSpan } from '../dto/ingest-traces.dto';

@Injectable()
export class TraceIngestionService {
    constructor(
        @InjectRepository(TraceSpanEntity)
        private readonly repo: Repository<TraceSpanEntity>,
        @Inject(FORWARDERS)
        private readonly forwarders: IForwarder[],
    ) {}

    async ingest(dto: IngestTracesDto): Promise<{ saved: number }> {
        const parsed = this.parseOtlp(dto.resourceSpans);
        if (!parsed.length) return { saved: 0 };

        const entities = parsed.map((s) => {
            const e = new TraceSpanEntity();
            e.traceId = s.traceId;
            e.spanId = s.spanId;
            e.parentSpanId = s.parentSpanId;
            e.name = s.name;
            e.serviceName = s.serviceName;
            e.correlationId = s.correlationId;
            e.kind = s.kind;
            e.statusCode = s.statusCode;
            e.startTime = s.startTime;
            e.endTime = s.endTime;
            e.durationMs = s.durationMs;
            e.attributes = s.attributes;
            e.events = s.events;
            return e;
        });

        await this.repo.save(entities, { chunk: 100 });

        for (const fwd of this.forwarders) {
            fwd.forwardSpans(dto.resourceSpans).catch(() => {});
        }

        return { saved: entities.length };
    }

    private parseOtlp(resourceSpans: any[]): ParsedSpan[] {
        const result: ParsedSpan[] = [];
        for (const rs of resourceSpans) {
            const serviceName =
                rs.resource?.attributes?.find((a: any) => a.key === 'service.name')?.value?.stringValue ?? 'unknown';
            for (const ss of rs.scopeSpans ?? []) {
                for (const span of ss.spans ?? []) {
                    const attrs = this.flattenAttributes(span.attributes ?? []);
                    const startNs = BigInt(span.startTimeUnixNano ?? '0');
                    const endNs = BigInt(span.endTimeUnixNano ?? '0');
                    const durationMs = endNs > startNs ? Number((endNs - startNs) / BigInt(1_000_000)) : null;

                    result.push({
                        traceId: span.traceId ?? '',
                        spanId: span.spanId ?? '',
                        parentSpanId: span.parentSpanId ?? null,
                        name: span.name ?? '',
                        serviceName,
                        correlationId: attrs['correlation.id'] ?? attrs['correlationId'] ?? null,
                        kind: span.kind != null ? String(span.kind) : null,
                        statusCode: span.status?.code != null ? String(span.status.code) : null,
                        startTime: span.startTimeUnixNano ?? '0',
                        endTime: span.endTimeUnixNano ?? '0',
                        durationMs,
                        attributes: Object.keys(attrs).length ? attrs : null,
                        events: span.events?.length ? span.events : null,
                    });
                }
            }
        }
        return result;
    }

    private flattenAttributes(attrs: { key: string; value: any }[]): Record<string, string> {
        const result: Record<string, string> = {};
        for (const { key, value } of attrs) {
            const v = value?.stringValue ?? value?.intValue ?? value?.boolValue ?? value?.doubleValue;
            if (v != null) result[key] = String(v);
        }
        return result;
    }
}
