// api-gateway/inbound/batch-drafts/batch-drafts.controller.ts
import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { CurrentUser, JwtPayload } from '../../auth/decorators/current-user.decorator';
import { TracingService } from '@app/observability';

@ApiTags('BatchDrafts')
@ApiBearerAuth('jwt')
@Controller('api/batch-drafts')
export class BatchDraftsController {
    constructor(
        private readonly monolith: MonolithClient,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Obtener draft del lote del técnico autenticado' })
    async getMyDraft(@CurrentUser() user: JwtPayload) {
        return this.monolith.get('/batch-drafts', { userId: user.sub });
    }

    @Post('items')
    @HttpCode(HttpStatus.CREATED)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Agregar item al lote y holdear sus slots' })
    async addItem(@CurrentUser() user: JwtPayload, @Body() body: Record<string, any>) {
        return this.tracing.run('gateway.controller.batchDrafts.addItem', { kind: 'server' }, () => this._addItem(user, body));
    }
    private async _addItem(user: JwtPayload, body: Record<string, any>) {
        return this.monolith.post('/batch-drafts/items', body, { userId: user.sub });
    }

    @Patch('items/:id')
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Editar item del lote' })
    @ApiParam({ name: 'id' })
    async editItem(
        @CurrentUser() user: JwtPayload,
        @Param('id') id: string,
        @Body() body: Record<string, any>,
    ) {
        return this.tracing.run('gateway.controller.batchDrafts.editItem', { kind: 'server', attributes: { 'item.id': id } }, () => this._editItem(user, id, body));
    }
    private async _editItem(user: JwtPayload, id: string, body: Record<string, any>) {
        return this.monolith.patch(`/batch-drafts/items/${id}`, body, { userId: user.sub });
    }

    @Delete('items/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Eliminar item del lote y liberar sus holds' })
    @ApiParam({ name: 'id' })
    async removeItem(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
        return this.tracing.run('gateway.controller.batchDrafts.removeItem', { kind: 'server', attributes: { 'item.id': id } }, () => this._removeItem(user, id));
    }
    private async _removeItem(user: JwtPayload, id: string) {
        return this.monolith.delete(`/batch-drafts/items/${id}`, { userId: user.sub });
    }

    @Post('submit')
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Enviar el lote completo a ServiceNow' })
    async submit(@CurrentUser() user: JwtPayload) {
        return this.tracing.run('gateway.controller.batchDrafts.submit', { kind: 'server' }, () => this._submit(user));
    }
    private async _submit(user: JwtPayload) {
        return this.monolith.post('/batch-drafts/submit', {}, { userId: user.sub });
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Descartar el draft y liberar todos los holds' })
    async discard(@CurrentUser() user: JwtPayload) {
        return this.tracing.run('gateway.controller.batchDrafts.discard', { kind: 'server' }, () => this._discard(user));
    }
    private async _discard(user: JwtPayload) {
        return this.monolith.delete('/batch-drafts', { userId: user.sub });
    }

    @Post('renew')
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Renovar TTL de los holds activos del técnico' })
    async renewHolds(@CurrentUser() user: JwtPayload) {
        return this.monolith.post('/batch-drafts/renew', {}, { userId: user.sub });
    }
}
