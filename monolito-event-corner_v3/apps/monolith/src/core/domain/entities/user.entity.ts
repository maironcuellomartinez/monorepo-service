// core/domain/entities/user.entity.ts
import { UserId, CompanyId } from '../value-objects/ids';
import { Email } from '../value-objects/email.value';
import { Result } from '@app/result';

export interface UserProps {
    id: UserId;
    externalId: string;
    name: string | null;
    lastName: string | null;
    fullName: string | null;
    email: Email | null;
    companyId: CompanyId | null;
    domain: string | null;
    upn: string | null;
    deviceTokens: string[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export class User {
    private constructor(private props: UserProps) { }

    // Getters
    get id(): UserId { return this.props.id; }
    get externalId(): string { return this.props.externalId; }
    get name(): string | null { return this.props.name; }
    get lastName(): string | null { return this.props.lastName; }
    get fullName(): string | null { return this.props.fullName; }
    get email(): Email | null { return this.props.email; }
    get companyId(): CompanyId | null { return this.props.companyId; }
    get domain(): string | null { return this.props.domain; }
    get upn(): string | null { return this.props.upn; }
    get deviceTokens(): string[] { return [...this.props.deviceTokens]; }
    get isActive(): boolean { return this.props.isActive; }

    // Métodos de negocio
    hasDeviceToken(token: string): boolean {
        return this.props.deviceTokens.includes(token);
    }

    addDeviceToken(token: string): void {
        if (!this.hasDeviceToken(token)) {
            this.props.deviceTokens.push(token);
            this.props.updatedAt = new Date();
        }
    }

    removeDeviceToken(token: string): void {
        this.props.deviceTokens = this.props.deviceTokens.filter(t => t !== token);
        this.props.updatedAt = new Date();
    }

    clearDeviceTokens(): void {
        this.props.deviceTokens = [];
        this.props.updatedAt = new Date();
    }

    updateCompany(companyId: CompanyId | null): void {
        this.props.companyId = companyId;
        this.props.updatedAt = new Date();
    }

    syncFromProvider(data: any): void {
        this.props.name = data.name ?? this.props.name;
        this.props.lastName = data.last_name ?? this.props.lastName;
        this.props.fullName = data.full_name ?? this.props.fullName;
        this.props.domain = data.domain ?? this.props.domain;
        this.props.upn = data.upn ?? this.props.upn;
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

    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    static reconstitute(
        id: UserId,
        externalId: string,
        name: string | null,
        lastName: string | null,
        fullName: string | null,
        email: Email | null,
        companyId: CompanyId | null,
        domain: string | null,
        upn: string | null,
        deviceTokens: string[],
        isActive: boolean,
        createdAt: Date,
        updatedAt: Date,
    ): User {
        return new User({
            id,
            externalId,
            name,
            lastName,
            fullName,
            email,
            companyId,
            domain,
            upn,
            deviceTokens,
            isActive,
            createdAt,
            updatedAt,
        });
    }

    toJSON() { return { ...this.props }; }

    // Factory method
    static create(
        id: UserId,
        externalId: string,
        name: string | null,
        lastName: string | null,
        fullName: string | null,
        email: Email | null,
        companyId: CompanyId | null,
        domain: string | null,
        upn: string | null,
    ): Result<User> {
        if (!externalId || externalId.trim().length === 0) {
            return Result.err(new Error('external ID is required'));
        }

        const now = new Date();
        const user = new User({
            id,
            externalId,
            name,
            lastName,
            fullName,
            email,
            companyId,
            domain,
            upn,
            deviceTokens: [],
            isActive: true,
            createdAt: now,
            updatedAt: now,
        });

        return Result.ok(user);
    }
}