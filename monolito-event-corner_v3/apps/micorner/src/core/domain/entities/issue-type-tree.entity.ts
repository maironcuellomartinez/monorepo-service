// core/domain/entities/issue-type-tree.entity.ts
import { Result } from '@app/result';
import { IssueTypeTreeId } from '../value-objects/ids';

export interface IssueTypeTreeProps {
    id: IssueTypeTreeId;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Árbol de tipos de incidencia.
 * Agrupa IssueTypes bajo un nombre (DEFAULT, tree_1, etc.)
 * y determina qué tipos de cita pueden usar las empresas asignadas a este árbol.
 */
export class IssueTypeTree {
    private constructor(private props: IssueTypeTreeProps) { }

    get id(): IssueTypeTreeId { return this.props.id; }
    get name(): string { return this.props.name; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
    toJSON() { return { ...this.props }; }

    rename(name: string): void {
        this.props.name = name;
        this.props.updatedAt = new Date();
    }

    static reconstitute(
        id: IssueTypeTreeId,
        name: string,
        createdAt: Date,
        updatedAt: Date,
    ): IssueTypeTree {
        return new IssueTypeTree({ id, name, createdAt, updatedAt });
    }

    static create(id: IssueTypeTreeId, name: string): Result<IssueTypeTree> {
        const now = new Date();
        return Result.ok(new IssueTypeTree({ id, name, createdAt: now, updatedAt: now }));
    }
}
