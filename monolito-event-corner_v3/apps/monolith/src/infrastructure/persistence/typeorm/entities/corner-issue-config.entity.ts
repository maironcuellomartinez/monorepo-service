import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { IssueTypeEntity } from './issue-type.entity';

@Entity('company_issue_configs')
@Unique(['company_id', 'issue_type_id'])
export class CompanyIssueConfigEntity {
    @PrimaryColumn({ length: 50 })
    config_id: string;

    @Column({ length: 50 })
    company_id: string;

    @Column({ length: 50 })
    issue_type_id: string;

    @Column({ length: 150 })
    servicenow_group: string;

    @Column({ type: 'int', nullable: true })
    work_minutes_override: number | null;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @ManyToOne(() => CompanyEntity)
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity;

    @ManyToOne(() => IssueTypeEntity)
    @JoinColumn({ name: 'issue_type_id' })
    issueType: IssueTypeEntity;
}
