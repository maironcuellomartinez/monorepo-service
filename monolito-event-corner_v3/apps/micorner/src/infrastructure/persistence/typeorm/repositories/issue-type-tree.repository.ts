// infrastructure/persistence/typeorm/repositories/issue-type-tree.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IIssueTypeTreeRepository } from '../../../../core/ports/outgoing/repositories/issue-type-tree-repository.port';
import { IssueTypeTreeEntity } from '../entities/issue-type-tree.entity';
import { IssueTypeTree } from '../../../../core/domain/entities/issue-type-tree.entity';
import { IssueTypeTreeId } from '../../../../core/domain/value-objects/ids';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmIssueTypeTreeRepository implements IIssueTypeTreeRepository {
    constructor(
        @InjectRepository(IssueTypeTreeEntity)
        private readonly repo: Repository<IssueTypeTreeEntity>,
    ) { }

    async save(tree: IssueTypeTree): Promise<Result<void>> {
        try {
            await this.repo.save(this.toEntity(tree));
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findById(id: IssueTypeTreeId | string): Promise<Result<IssueTypeTree | null>> {
        try {
            const entity = await this.repo.findOne({ where: { tree_id: id.toString() } });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByName(name: string): Promise<Result<IssueTypeTree | null>> {
        try {
            const entity = await this.repo.findOne({ where: { name } });
            if (!entity) return Result.ok(null);
            return Result.ok(this.toDomain(entity));
        } catch (error) {
            return Result.err(error);
        }
    }

    async findAll(): Promise<Result<IssueTypeTree[]>> {
        try {
            const entities = await this.repo.find({ order: { name: 'ASC' } });
            return Result.ok(entities.map(e => this.toDomain(e)));
        } catch (error) {
            return Result.err(error);
        }
    }

    async update(tree: IssueTypeTree): Promise<Result<void>> {
        try {
            await this.repo.update(
                { tree_id: tree.id.toString() },
                { name: tree.name, updated_at: tree.updatedAt },
            );
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async delete(id: IssueTypeTreeId | string): Promise<Result<void>> {
        try {
            await this.repo.delete({ tree_id: id.toString() });
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    private toEntity(domain: IssueTypeTree): IssueTypeTreeEntity {
        const entity = new IssueTypeTreeEntity();
        entity.tree_id = domain.id.toString();
        entity.name = domain.name;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;
        return entity;
    }

    private toDomain(entity: IssueTypeTreeEntity): IssueTypeTree {
        return IssueTypeTree.reconstitute(
            IssueTypeTreeId(entity.tree_id as any),
            entity.name,
            entity.created_at,
            entity.updated_at,
        );
    }
}
