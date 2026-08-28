// core/domain/entities/company.entity.ts
import { Result } from '@app/result';
import { CompanyId, IssueTypeTreeId } from '../value-objects/ids';
import { ServiceNowProfileId } from '@app/shared/types/branded-ids';

export interface CompanyProps {
    id: CompanyId;
    name: string;
    /** Null = sincronizada desde SN, todavía sin árbol de tipos de cita asignado por el admin. */
    treeId: IssueTypeTreeId | null;
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
    get treeId(): IssueTypeTreeId | null { return this.props.treeId; }
    get profileId(): ServiceNowProfileId | null { return this.props.profileId; }
    get isActive(): boolean { return this.props.isActive; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
    toJSON() { return { ...this.props }; }

    /** true si la empresa tiene perfil SN asignado. false → usar SN_DEFAULT_COMPANY_SYS_ID. */
    hasServiceNowProfile(): boolean {
        return this.props.profileId !== null;
    }

    assignTree(treeId: IssueTypeTreeId | null): void {
        this.props.treeId = treeId;
        this.props.updatedAt = new Date();
    }

    /**
     * Vincula esta compañía a un perfil SN. Uso exclusivo del sync
     * (SnCompanySyncJob) cuando encuentra por nombre una compañía existente
     * sin perfil todavía — no se expone en ninguna API, `profileId` no es
     * editable por el admin.
     */
    assignServiceNowProfile(profileId: ServiceNowProfileId): void {
        this.props.profileId = profileId;
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
        treeId: IssueTypeTreeId | null,
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
        profileId: ServiceNowProfileId,
        treeId?: IssueTypeTreeId | null,
    ): Result<Company> {
        const now = new Date();
        return Result.ok(new Company({
            id, name,
            treeId: treeId ?? null,
            profileId,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        }));
    }
}
