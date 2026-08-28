import { IssueType } from '../../../domain/entities/issue-type.entity';
import { IssueTypeId } from '../../../domain/value-objects/ids';
import { IssueCategory } from '../../../domain/enums/issue-category.enum';
import { Result } from '@app/result';
import { ISSUE_TYPE_REPOSITORY } from './tokens';

export interface IIssueTypeRepository {
    save(issueType: IssueType): Promise<Result<void>>;
    findById(id: IssueTypeId | string): Promise<Result<IssueType | null>>;
    findByTree(treeId: string): Promise<Result<IssueType[]>>;
    /** TODOS los issue_types del árbol (activos e inactivos) — a diferencia de findByTree, incluye los soft-deleted (para decidir si un árbol es borrable). */
    findAllByTree(treeId: string): Promise<Result<IssueType[]>>;
    /** true si el issue_type tiene historial real (appointments o company_issue_configs) — un inactivo sin historial es borrable en duro. */
    isReferenced(id: IssueTypeId | string): Promise<Result<boolean>>;
    /** Borrado físico — solo seguro para issue_types inactivos sin historial (ver isReferenced). */
    hardDelete(id: IssueTypeId | string): Promise<Result<void>>;
    findAllActive(): Promise<Result<IssueType[]>>;
    findByCategory(category: IssueCategory): Promise<Result<IssueType[]>>;
    findByDeviceType(deviceType: string): Promise<Result<IssueType[]>>;
    findVisibleToUsers(): Promise<Result<IssueType[]>>;
    findWithFilters(filters: {
        category?: IssueCategory;
        deviceType?: string;
        visibleToUsers?: boolean;
        treeId?: string;
    }): Promise<Result<IssueType[]>>;
    update(issueType: IssueType): Promise<Result<void>>;
    delete(id: IssueTypeId | string): Promise<Result<void>>;
}

export { ISSUE_TYPE_REPOSITORY };
