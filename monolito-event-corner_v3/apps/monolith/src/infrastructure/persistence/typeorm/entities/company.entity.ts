// infrastructure/persistence/typeorm/entities/company.entity.ts
import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { IssueTypeTreeEntity } from './issue-type-tree.entity';
import { ServiceNowProfileEntity } from './servicenow-profile.entity';
import { UserEntity } from './user.entity';

@Entity('companies')
@Index('idx_companies_tree_id', ['tree_id'])
export class CompanyEntity {
    @PrimaryColumn({ length: 50 })
    company_id: string;

    @Column({ length: 100, unique: true })
    name: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    tree_id: string | null;

    /** FK al perfil ServiceNow. Null = sin mapeo → usar SN_DEFAULT_COMPANY_SYS_ID del env. */
    @Column({ type: 'varchar', length: 50, nullable: true })
    profile_id: string | null;

    @Column({ default: true })
    is_active: boolean;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @ManyToOne(() => IssueTypeTreeEntity, tree => tree.companies, { nullable: true })
    @JoinColumn({ name: 'tree_id' })
    issueTypeTree: IssueTypeTreeEntity | null;

    @ManyToOne(() => ServiceNowProfileEntity, { nullable: true, eager: false })
    @JoinColumn({ name: 'profile_id' })
    snowProfile: ServiceNowProfileEntity | null;

    @OneToMany(() => UserEntity, user => user.company)
    users: UserEntity[];
}
