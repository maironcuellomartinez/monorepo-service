/**
 * Módulo de Bulkhead para NestJS
 */
import { Global, Module } from '@nestjs/common';
import { BulkheadRegistry } from './bulkhead.registry';
import { BulkheadGuard } from './bulkhead.guard';
import { BulkheadService } from './bulkhead.service';
import { BulkheadInterceptor } from './bulkhead.interceptor';

@Global()
@Module({
    providers: [
        BulkheadRegistry,
        BulkheadGuard,
        BulkheadService,
        BulkheadInterceptor,
    ],
    exports: [
        BulkheadRegistry,
        BulkheadGuard,
        BulkheadService,
        BulkheadInterceptor,
    ],
})
export class BulkheadModule { }
