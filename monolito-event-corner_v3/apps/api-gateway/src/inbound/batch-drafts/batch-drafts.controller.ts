// api-gateway/inbound/batch-drafts/batch-drafts.controller.ts
import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { CurrentUser, JwtPayload } from '../../auth/decorators/current-user.decorator';

@ApiTags('BatchDrafts')
@ApiBearerAuth('jwt')
@Controller('api/batch-drafts')
export class BatchDraftsController {
    constructor(private readonly monolith: MonolithClient) {}

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
        return this.monolith.patch(`/batch-drafts/items/${id}`, body, { userId: user.sub });
    }

    @Delete('items/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Eliminar item del lote y liberar sus holds' })
    @ApiParam({ name: 'id' })
    async removeItem(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
        return this.monolith.delete(`/batch-drafts/items/${id}`, { userId: user.sub });
    }

    @Post('submit')
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Enviar el lote completo a ServiceNow' })
    async submit(@CurrentUser() user: JwtPayload) {
        return this.monolith.post('/batch-drafts/submit', {}, { userId: user.sub });
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Descartar el draft y liberar todos los holds' })
    async discard(@CurrentUser() user: JwtPayload) {
        return this.monolith.delete('/batch-drafts', { userId: user.sub });
    }

    @Post('renew')
    @Permission('incident', 'create')
    @ApiOperation({ summary: 'Renovar TTL de los holds activos del técnico' })
    async renewHolds(@CurrentUser() user: JwtPayload) {
        return this.monolith.post('/batch-drafts/renew', {}, { userId: user.sub });
    }
}
