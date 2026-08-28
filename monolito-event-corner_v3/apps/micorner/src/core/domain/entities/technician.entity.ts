// core/domain/entities/technician.entity.ts
import { TechnicianId, CornerId, UserId } from '../value-objects/ids';
import { Email } from '../value-objects/email.value';
import { Result } from '@app/result';

export interface TechnicianProps {
    id: TechnicianId;
    /** FK al usuario del micorner — null si aún no está vinculado a un User. */
    userId: UserId | null;
    name: string;
    lastName: string | null;
    fullName: string | null;
    email: string;
    cornerId: CornerId | null;
    disabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export class Technician {
    private constructor(private props: TechnicianProps) { }

    // Getters
    get id(): TechnicianId { return this.props.id; }
    get userId(): UserId | null { return this.props.userId; }
    get name(): string { return this.props.name; }
    get lastName(): string | null { return this.props.lastName; }
    get fullName(): string | null { return this.props.fullName; }
    get email(): string { return this.props.email; }
    get cornerId(): CornerId | null { return this.props.cornerId; }
    get disabled(): boolean { return this.props.disabled; }

    // Métodos de negocio
    isAvailable(): boolean {
        return !this.props.disabled;
    }

    disable(): void {
        this.props.disabled = true;
        this.props.updatedAt = new Date();
    }

    unlinkUser(): void {
        this.props.userId = null;
        this.props.updatedAt = new Date();
    }

    enable(): void {
        this.props.disabled = false;
        this.props.updatedAt = new Date();
    }

    transferToCorner(newCornerId: CornerId): void {
        this.props.cornerId = newCornerId;
        this.props.updatedAt = new Date();
    }

    updatePersonalInfo(name: string, lastName: string | null, fullName: string): void {
        this.props.name = name;
        this.props.lastName = lastName;
        this.props.fullName = fullName;
        this.props.updatedAt = new Date();
    }

    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    update(name: string, lastName: string | null, fullName: string | null, email: string, cornerId: CornerId | null): void {
        this.props.name = name;
        this.props.lastName = lastName;
        this.props.fullName = fullName;
        this.props.email = email;
        this.props.cornerId = cornerId;
        this.props.updatedAt = new Date();
    }

    static reconstitute(
        id: TechnicianId,
        name: string,
        lastName: string | null,
        fullName: string | null,
        email: string,
        cornerId: CornerId | null,
        disabled: boolean,
        createdAt: Date,
        updatedAt: Date,
        userId: UserId | null = null,
    ): Technician {
        return new Technician({
            id,
            userId,
            name,
            lastName,
            fullName,
            email,
            cornerId,
            disabled,
            createdAt,
            updatedAt,
        });
    }

    toJSON() { return { ...this.props }; }

    // Factory method
    static create(
        id: TechnicianId,
        name: string,
        email: string,
        cornerId: CornerId | null,
        lastName?: string | null,
        userId?: UserId | null,
    ): Result<Technician> {
        if (!name || name.trim().length === 0) {
            return Result.err(new Error('Technician name is required'));
        }

        if (!email || email.trim().length === 0) {
            return Result.err(new Error('Technician email is required'));
        }

        const fullName = lastName ? `${name} ${lastName}`.trim() : name;
        const now = new Date();

        const technician = new Technician({
            id,
            userId: userId ?? null,
            name,
            lastName: lastName || null,
            fullName,
            email,
            cornerId,
            disabled: false,
            createdAt: now,
            updatedAt: now,
        });

        return Result.ok(technician);
    }
}