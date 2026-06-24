// internal-api/batch-drafts/internal-batch-drafts.controller.ts
import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { BatchDraftService } from '../../core/services/batch-draft/batch-draft.service';
import { AddBatchItemCommand, EditBatchItemCommand } from '../../core/services/batch-draft/batch-draft.types';

@ApiTags('BatchDrafts')
@ApiBearerAuth()
@Controller('internal/batch-drafts')
export class InternalBatchDraftsController {
    constructor(private readonly service: BatchDraftService) {}

    @Get()
    @ApiOperation({ summary: 'Obtener draft del técnico. Retorna null si no existe.' })
    @ApiQuery({ name: 'userId', required: true })
    async getMyDraft(@Query('userId') userId: string) {
        return unwrapOrThrow(await this.service.getMyDraft(userId));
    }

    @Post('items')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Agregar item al lote y holdear sus slots.' })
    @ApiQuery({ name: 'userId', required: true })
    async addItem(@Query('userId') userId: string, @Body() body: AddBatchItemCommand) {
        return unwrapOrThrow(await this.service.addItem(userId, body));
    }

    @Patch('items/:id')
    @ApiOperation({ summary: 'Editar item del lote. Si cambian los slots, mueve los holds.' })
    @ApiQuery({ name: 'userId', required: true })
    async editItem(
        @Query('userId') userId: string,
        @Param('id') itemId: string,
        @Body() body: EditBatchItemCommand,
    ) {
        return unwrapOrThrow(await this.service.editItem(userId, itemId, body));
    }

    @Delete('items/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar item del lote y liberar sus holds.' })
    @ApiQuery({ name: 'userId', required: true })
    async removeItem(@Query('userId') userId: string, @Param('id') itemId: string) {
        return unwrapOrThrow(await this.service.removeItem(userId, itemId));
    }

    @Post('submit')
    @ApiOperation({ summary: 'Enviar el lote. Convierte HELD → BOOKED y crea incidencias.' })
    @ApiQuery({ name: 'userId', required: true })
    async submit(@Query('userId') userId: string) {
        return unwrapOrThrow(await this.service.submit(userId));
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Descartar draft completo y liberar todos los holds.' })
    @ApiQuery({ name: 'userId', required: true })
    async discard(@Query('userId') userId: string) {
        return unwrapOrThrow(await this.service.discard(userId));
    }

    @Post('renew')
    @ApiOperation({ summary: 'Renovar TTL de todos los holds activos del técnico.' })
    @ApiQuery({ name: 'userId', required: true })
    async renewHolds(@Query('userId') userId: string) {
        return unwrapOrThrow(await this.service.renewHolds(userId));
    }
}
