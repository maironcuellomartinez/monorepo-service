import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('servicenow_groups')
export class ServiceNowGroupEntity {
    @PrimaryColumn({ length: 50 })
    group_id: string;

    @Column({ length: 150, unique: true })
    group_name: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description: string | null;

    @Column({ default: true })
    is_active: boolean;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}
