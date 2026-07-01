import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AbacClient, BatchCheckItem } from '../../auth/abac.client';
import { CurrentUser, JwtPayload } from '../../auth/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { TracingService } from '@app/observability';

class BatchEvaluateRequestDto {
    checks!: BatchCheckItem[];
}

@ApiTags('ABAC')
@Controller('api/abac')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class AbacController {
    constructor(
        private readonly abacClient: AbacClient,
        private readonly tracing: TracingService,
    ) {}

    /**
     * Evalúa en lote permisos ABAC para el usuario autenticado.
     * El frontend envía la lista de resource:action que necesita verificar;
     * el gateway inyecta userId y applicationId desde el JWT — el cliente
     * nunca maneja sus propios IDs de ABAC.
     */
    @Post('batch-evaluate')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Evaluación batch de permisos del usuario autenticado',
        description: 'Recibe lista de {resource, action, context?} y devuelve granted por cada uno.',
    })
    async batchEvaluate(
        @CurrentUser() user: JwtPayload,
        @Body() body: BatchEvaluateRequestDto,
    ) {
        return this.tracing.run('gateway.controller.abac.batchEvaluate', { kind: 'server' }, () => this._batchEvaluate(user, body));
    }
    private async _batchEvaluate(user: JwtPayload, body: BatchEvaluateRequestDto) {
        const results = await this.abacClient.batchEvaluate(user.sub, body.checks);
        return { results };
    }
}
