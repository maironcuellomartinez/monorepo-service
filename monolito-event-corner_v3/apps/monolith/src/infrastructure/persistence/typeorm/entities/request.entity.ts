// infrastructure/persistence/typeorm/entities/request.entity.ts
import { Entity, Column, PrimaryColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { IssueTypeEntity } from './issue-type.entity';
import { TechnicianEntity } from './technician.entity';
import { UserEntity } from './user.entity';
import { CornerEntity } from './corner.entity';
import { CompanyEntity } from './company.entity';
import { DeviceEntity } from './device.entity';
import { RequestActivityEntity } from './request-activity.entity';

@Entity('requests')
export class RequestEntity {
    @PrimaryColumn({ length: 50 })
    request_id: string;

    @Column({ length: 50 })
    issue_type_id: string;

    @Column({ length: 50 })
    technician_id: string;

    @Column({ length: 50 })
    customer_id: string;

    @Column({ length: 50 })
    corner_id: string;

    @Column({ length: 50 })
    company_id: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    device_id: string | null;

    @Column({ length: 20 })
    status: string;

    @Column({ type: 'timestamp' })
    scheduled_at: Date;

    @Column({ type: 'varchar', length: 100, nullable: true })
    servicenow_id: string | null;

    @Column({ type: 'varchar', length: 50, nullable: true })
    servicenow_number: string | null;

    /** correlationId de api-snowq-service cuando el ticket fue procesado en modo async */
    @Column({ type: 'varchar', length: 36, nullable: true })
    snowq_correlation_id: string | null;

    @Column({ type: 'text', nullable: true })
    notes: string | null;

    @Column({ type: 'timestamp', nullable: true })
    closed_at: Date | null;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @ManyToOne(() => IssueTypeEntity)
    @JoinColumn({ name: 'issue_type_id' })
    issueType: IssueTypeEntity;

    @ManyToOne(() => TechnicianEntity)
    @JoinColumn({ name: 'technician_id' })
    technician: TechnicianEntity;

    @ManyToOne(() => UserEntity)
    @JoinColumn({ name: 'customer_id' })
    customer: UserEntity;

    @ManyToOne(() => CornerEntity)
    @JoinColumn({ name: 'corner_id' })
    corner: CornerEntity;

    @ManyToOne(() => CompanyEntity)
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity;

    @ManyToOne(() => DeviceEntity)
    @JoinColumn({ name: 'device_id' })
    device: DeviceEntity;

    @OneToMany(() => RequestActivityEntity, activity => activity.request)
    activities: RequestActivityEntity[];
}