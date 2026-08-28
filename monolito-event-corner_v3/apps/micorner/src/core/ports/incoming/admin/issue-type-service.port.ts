import { Result } from '@app/result';
import { IssueType } from '../../../domain/entities/issue-type.entity';
import { IssueCategory } from '../../../domain/enums/issue-category.enum';

export interface CreateIssueTypeCommand {
  treeId?: string;
  name: string;
  category: IssueCategory;
  deviceType?: string;
  servicenowCategory?: string;
  servicenowCloseCategory?: string;
  /** Urgencia SN (1–3). Default 2 si no se envía. */
  snUrgency?: number;
  /** Impacto SN (1–3). Default 2 si no se envía. */
  snImpact?: number;
  /** Severidad SN (critical|high|medium|low). Default 'medium' si no se envía. */
  snSeverity?: string;
  workMinutes?: number;
  spareMinutes?: number;
  closeMinutes?: number;
  notUserVisible?: boolean;
  position?: number;
  icon?: string;
  npsDisabled?: boolean;
}

export interface UpdateIssueTypeCommand extends Partial<CreateIssueTypeCommand> {
  id: string;
}

export interface IIssueTypeService {
  createIssueType(command: CreateIssueTypeCommand): Promise<Result<IssueType>>;
  updateIssueType(command: UpdateIssueTypeCommand): Promise<Result<IssueType>>;
  deleteIssueType(id: string): Promise<Result<void>>;
  getIssueType(id: string): Promise<Result<IssueType | null>>;
  listIssueTypes(filters?: {
    treeId?: string;
    category?: IssueCategory;
    deviceType?: string;
    visibleToUsers?: boolean;
  }): Promise<Result<IssueType[]>>;
}
