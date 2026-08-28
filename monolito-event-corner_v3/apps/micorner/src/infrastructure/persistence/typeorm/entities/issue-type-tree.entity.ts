// infrastructure/persistence/typeorm/entities/issue-type-tree.entity.ts
import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { IssueTypeEntity } from './issue-type.entity';

@Entity('issue_type_trees')
export class IssueTypeTreeEntity {
    @PrimaryColumn({ length: 50 })
    tree_id: string;

    @Column({ length: 100, unique: true })
    name: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @OneToMany(() => CompanyEntity, company => company.issueTypeTree)
    companies: CompanyEntity[];

    @OneToMany(() => IssueTypeEntity, issueType => issueType.issueTypeTree)
    issueTypes: IssueTypeEntity[];
}
