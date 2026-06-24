// src/presentation/controllers/metrics.controller.ts
import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import * as client from 'prom-client';

@ApiTags('Metrics')
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
    private readonly register: client.Registry;

    constructor(private readonly configService: ConfigService) {
        this.register = new client.Registry();

        // Colectar métricas por defecto
        client.collectDefaultMetrics({
            register: this.register,
            prefix: 'integration_service_',
        });

        // Métricas personalizadas
        this.registerCustomMetrics();
    }

    private registerCustomMetrics(): void {
        // Contador de integraciones
        const integrationCounter = new client.Counter({
            name: 'integration_requests_total',
            help: 'Total number of integration requests',
            labelNames: ['event_type', 'system', 'status'],
        });
        this.register.registerMetric(integrationCounter);

        // Histograma de duración
        const durationHistogram = new client.Histogram({
            name: 'integration_duration_seconds',
            help: 'Duration of integration processing',
            labelNames: ['event_type'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
        });
        this.register.registerMetric(durationHistogram);

        // Gauge de circuit breakers
        const circuitBreakerGauge = new client.Gauge({
            name: 'circuit_breaker_state',
            help: 'Current state of circuit breakers',
            labelNames: ['system'],
        });
        this.register.registerMetric(circuitBreakerGauge);

        // Contador de errores
        const errorCounter = new client.Counter({
            name: 'integration_errors_total',
            help: 'Total number of integration errors',
            labelNames: ['system', 'error_type'],
        });
        this.register.registerMetric(errorCounter);
    }

    @Get()
    @ApiOperation({ summary: 'Get Prometheus metrics' })
    async getMetrics(@Res() response: Response): Promise<void> {
        try {
            const metrics = await this.register.metrics();

            response.set('Content-Type', this.register.contentType);
            response.send(metrics);
        } catch (error) {
            response.status(500).json({
                error: 'Failed to collect metrics',
                message: error.message,
            });
        }
    }

    @Get('health')
    @ApiOperation({ summary: 'Get metrics health status' })
    getMetricsHealth(): any {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            metrics: {
                integration_requests_total: 'active',
                integration_duration_seconds: 'active',
                circuit_breaker_state: 'active',
                integration_errors_total: 'active',
            },
        };
    }
}