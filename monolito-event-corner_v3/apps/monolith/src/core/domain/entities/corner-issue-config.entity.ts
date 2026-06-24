import { CompanyId, CompanyIssueConfigId, IssueTypeId } from '@app/shared/types/branded-ids';
import { ServiceNowGroup } from '../value-objects/servicenow-group.value';
import { Result } from '@app/result';

export interface CompanyIssueConfigProps {
    id: CompanyIssueConfigId;
    companyId: CompanyId;
    issueTypeId: IssueTypeId;
    servicenowGroup: ServiceNowGroup;
    workMinutesOverride: number | null;
    createdAt: Date;
}

export class CompanyIssueConfig {
    private constructor(private props: CompanyIssueConfigProps) {}

    get id(): CompanyIssueConfigId { return this.props.id; }
    get companyId(): CompanyId { return this.props.companyId; }
    get issueTypeId(): IssueTypeId { return this.props.issueTypeId; }
    get servicenowGroup(): ServiceNowGroup { return this.props.servicenowGroup; }
    get workMinutesOverride(): number | null { return this.props.workMinutesOverride; }
    get createdAt(): Date { return this.props.createdAt; }
    toJSON() { return { ...this.props }; }

    getEffectiveWorkMinutes(baseWorkMinutes: number): number {
        return this.props.workMinutesOverride ?? baseWorkMinutes;
    }

    updateServiceNowGroup(group: ServiceNowGroup): void {
        this.props.servicenowGroup = group;
    }

    updateWorkMinutesOverride(minutes: number | null): void {
        this.props.workMinutesOverride = minutes;
    }

    static reconstitute(
        id: CompanyIssueConfigId,
        companyId: CompanyId,
        issueTypeId: IssueTypeId,
        servicenowGroup: ServiceNowGroup,
        workMinutesOverride: number | null,
        createdAt: Date,
    ): CompanyIssueConfig {
        return new CompanyIssueConfig({ id, companyId, issueTypeId, servicenowGroup, workMinutesOverride, createdAt });
    }

    static create(
        id: CompanyIssueConfigId,
        companyId: CompanyId,
        issueTypeId: IssueTypeId,
        servicenowGroup: ServiceNowGroup,
        workMinutesOverride?: number,
    ): Result<CompanyIssueConfig> {
        return Result.ok(new CompanyIssueConfig({
            id, companyId, issueTypeId, servicenowGroup,
            workMinutesOverride: workMinutesOverride ?? null,
            createdAt: new Date(),
        }));
    }
}
