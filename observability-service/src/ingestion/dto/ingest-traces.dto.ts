import { IsArray, IsObject } from 'class-validator';

// OTLP/HTTP JSON format: { resourceSpans: [...] }
// We accept the raw envelope to stay compatible with any OTel SDK version.
export class IngestTracesDto {
    @IsArray()
    resourceSpans: any[];
}

// Parsed internal shape after extracting from OTLP envelope
export interface ParsedSpan {
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    name: string;
    serviceName: string;
    correlationId: string | null;
    kind: string | null;
    statusCode: string | null;
    startTime: string;
    endTime: string;
    durationMs: number | null;
    attributes: Record<string, any> | null;
    events: Record<string, any>[] | null;
}
