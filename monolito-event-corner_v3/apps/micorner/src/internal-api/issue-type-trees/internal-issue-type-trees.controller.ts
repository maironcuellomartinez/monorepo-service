// internal-api/issue-type-trees/internal-issue-type-trees.controller.ts
import {
    Controller, Get, Post, Put, Delete,
    Body, Param, Inject, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { IIssueTypeTreeRepository, ISSUE_TYPE_TREE_REPOSITORY } from '../../core/ports/outgoing/repositories/issue-type-tree-repository.port';
import { IIssueTypeRepository, ISSUE_TYPE_REPOSITORY } from '../../core/ports/outgoing/repositories/issue-type-repository.port';
import { IssueTypeTree } from '../../core/domain/entities/issue-type-tree.entity';
import { IssueTypeTreeId } from '../../core/domain/value-objects/ids';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { IssueTypeTreeInUseError } from '@app/shared/errors/domain-error';
import { TracingService } from '@app/observability';
import { Result } from '@app/result';

class CreateTreeDto {
    @IsString() @IsNotEmpty()
    id: string;

    @IsString() @IsNotEmpty()
    name: string;
}

class RenameTreeDto {
    @IsString() @IsNotEmpty()
    name: string;
}

@ApiTags('Issue Type Trees')
@ApiBearerAuth()
@Controller('internal/trees')
export class InternalIssueTypeTreesController {
    constructor(
        @Inject(ISSUE_TYPE_TREE_REPOSITORY) private readonly treeRepo: IIssueTypeTreeRepository,
        @Inject(ISSUE_TYPE_REPOSITORY) private readonly issueTypeRepo: IIssueTypeRepository,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Listar todos los árboles de tipos de cita' })
    async list() {
        const result = await this.treeRepo.findAll();
        return unwrapOrThrow(result).map((t) => this.toDto(t));
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear árbol de tipos de cita' })
    async create(@Body() dto: CreateTreeDto) {
        return this.tracing.run('micorner.controller.trees.create', { kind: 'server' }, () => this._create(dto));
    }

    private async _create(dto: CreateTreeDto) {
        const existing = await this.treeRepo.findById(dto.id);
        if (!existing.isFailure && existing.unwrap()) {
            throw Object.assign(new Error(`Ya existe un árbol con ID "${dto.id}"`), { status: 409 });
        }
        const treeResult = IssueTypeTree.create(
            IssueTypeTreeId(dto.id as any),
            dto.name,
        );
        const tree = unwrapOrThrow(treeResult);
        unwrapOrThrow(await this.treeRepo.save(tree));
        return this.toDto(tree);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Renombrar árbol' })
    @ApiParam({ name: 'id' })
    async rename(@Param('id') id: string, @Body() dto: RenameTreeDto) {
        return this.tracing.run('micorner.controller.trees.rename', { kind: 'server', attributes: { 'tree.id': id } }, () => this._rename(id, dto));
    }

    private async _rename(id: string, dto: RenameTreeDto) {
        const result = await this.treeRepo.findById(id);
        const tree = unwrapOrThrow(result);
        if (!tree) throw Object.assign(new Error(`Árbol "${id}" no encontrado`), { status: 404 });
        tree.rename(dto.name);
        unwrapOrThrow(await this.treeRepo.update(tree));
        return this.toDto(tree);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar árbol (solo si no tiene tipos de cita asignados)' })
    @ApiParam({ name: 'id' })
    async delete(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.trees.delete', { kind: 'server', attributes: { 'tree.id': id } }, () => this._delete(id));
    }

    private async _delete(id: string) {
        const result = await this.treeRepo.findById(id);
        const tree = unwrapOrThrow(result);
        if (!tree) throw Object.assign(new Error(`Árbol "${id}" no encontrado`), { status: 404 });

        const allTypes = unwrapOrThrow(await this.issueTypeRepo.findAllByTree(id));

        // "Asignado" = activo. Uno desactivado ya no cuenta para el usuario,
        // pero su fila sigue ahí por la FK — se limpia más abajo si no tiene historial.
        if (allTypes.some((it) => it.isActive)) {
            unwrapOrThrow(Result.err(new IssueTypeTreeInUseError(id)));
        }

        for (const inactive of allTypes) {
            const referenced = unwrapOrThrow(await this.issueTypeRepo.isReferenced(inactive.id));
            if (referenced) {
                unwrapOrThrow(Result.err(new IssueTypeTreeInUseError(id)));
            }
        }
        for (const inactive of allTypes) {
            unwrapOrThrow(await this.issueTypeRepo.hardDelete(inactive.id));
        }

        unwrapOrThrow(await this.treeRepo.delete(id));
    }

    private toDto(t: IssueTypeTree) {
        return { id: t.id.toString(), name: t.name, createdAt: t.createdAt, updatedAt: t.updatedAt };
    }
}
