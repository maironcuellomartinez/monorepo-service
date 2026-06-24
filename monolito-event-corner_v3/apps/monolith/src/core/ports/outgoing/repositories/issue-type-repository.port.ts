import { IssueType } from '../../../domain/entities/issue-type.entity';
import { IssueTypeId } from '../../../domain/value-objects/ids';
import { IssueCategory } from '../../../domain/enums/issue-category.enum';
import { Result } from '@app/result';
import { ISSUE_TYPE_REPOSITORY } from './tokens';

export interface IIssueTypeRepository {
    save(issueType: IssueType): Promise<Result<void>>;
    findById(id: IssueTypeId | string): Promise<Result<IssueType | null>>;
    findByTree(treeId: string): Promise<Result<IssueType[]>>;
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
