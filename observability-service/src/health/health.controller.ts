import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    @Public()
    @Get()
    @ApiOperation({ summary: 'Health check' })
    async check(): Promise<{ status: string; db: string; uptime: number }> {
        let dbStatus = 'ok';
        try {
            await this.dataSource.query('SELECT 1');
        } catch {
            dbStatus = 'error';
        }
        return {
            status: dbStatus === 'ok' ? 'ok' : 'degraded',
            db: dbStatus,
            uptime: process.uptime(),
        };
    }
}
