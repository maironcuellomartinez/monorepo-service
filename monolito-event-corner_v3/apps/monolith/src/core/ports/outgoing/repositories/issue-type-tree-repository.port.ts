// core/ports/outgoing/repositories/issue-type-tree-repository.port.ts
import { Result } from '@app/result';
import { IssueTypeTree } from '../../../domain/entities/issue-type-tree.entity';
import { IssueTypeTreeId } from '../../../domain/value-objects/ids';
import { ISSUE_TYPE_TREE_REPOSITORY } from './tokens';

export interface IIssueTypeTreeRepository {
    save(tree: IssueTypeTree): Promise<Result<void>>;
    findById(id: IssueTypeTreeId | string): Promise<Result<IssueTypeTree | null>>;
    findByName(name: string): Promise<Result<IssueTypeTree | null>>;
    findAll(): Promise<Result<IssueTypeTree[]>>;
    update(tree: IssueTypeTree): Promise<Result<void>>;
    delete(id: IssueTypeTreeId | string): Promise<Result<void>>;
}

export { ISSUE_TYPE_TREE_REPOSITORY };
