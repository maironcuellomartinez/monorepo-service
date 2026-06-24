// core/domain/entities/company.entity.ts
import { Result } from '@app/result';
import { CompanyId, IssueTypeTreeId } from '../value-objects/ids';
import { ServiceNowProfileId } from '@app/shared/types/branded-ids';

export interface CompanyProps {
    id: CompanyId;
    name: string;
    treeId: IssueTypeTreeId;
    /** FK al perfil de ServiceNow. Null = sin mapeo → usar SN_DEFAULT_COMPANY_SYS_ID. */
    profileId: ServiceNowProfileId | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export class Company {
    private constructor(private props: CompanyProps) { }

    get id(): CompanyId { return this.props.id; }
    get name(): string { return this.props.name; }
    get treeId(): IssueTypeTreeId { return this.props.treeId; }
    get profileId(): ServiceNowProfileId | null { return this.props.profileId; }
    get isActive(): boolean { return this.props.isActive; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
    toJSON() { return { ...this.props }; }

    /** true si la empresa tiene perfil SN asignado. false → usar SN_DEFAULT_COMPANY_SYS_ID. */
    hasServiceNowProfile(): boolean {
        return this.props.profileId !== null;
    }

    update(name: string): void {
        this.props.name = name;
        this.props.updatedAt = new Date();
    }

    assignServiceNowProfile(profileId: ServiceNowProfileId | null): void {
        this.props.profileId = profileId;
        this.props.updatedAt = new Date();
    }

    assignTree(treeId: IssueTypeTreeId): void {
        this.props.treeId = treeId;
        this.props.updatedAt = new Date();
    }

    deactivate(): void {
        this.props.isActive = false;
        this.props.updatedAt = new Date();
    }

    activate(): void {
        this.props.isActive = true;
        this.props.updatedAt = new Date();
    }

    static reconstitute(
        id: CompanyId,
        name: string,
        treeId: IssueTypeTreeId,
        profileId: ServiceNowProfileId | null,
        isActive: boolean,
        createdAt: Date,
        updatedAt: Date,
    ): Company {
        return new Company({ id, name, treeId, profileId, isActive, createdAt, updatedAt });
    }

    static create(
        id: CompanyId,
        name: string,
        treeId: IssueTypeTreeId,
        profileId?: ServiceNowProfileId | null,
    ): Result<Company> {
        const now = new Date();
        return Result.ok(new Company({
            id, name, treeId,
            profileId: profileId ?? null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        }));
    }
}
