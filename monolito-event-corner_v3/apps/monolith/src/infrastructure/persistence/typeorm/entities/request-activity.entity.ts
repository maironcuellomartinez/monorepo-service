// infrastructure/persistence/typeorm/entities/request-activity.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { RequestEntity } from './request.entity';
import { TechnicianEntity } from './technician.entity';

@Entity('request_activities')
export class RequestActivityEntity {
    @PrimaryGeneratedColumn('uuid')
    activity_id: string;

    @Column({ length: 50 })
    request_id: string;

    @Column({ length: 50 })
    technician_id: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    from_status: string;

    @Column({ length: 20 })
    to_status: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    comment: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @ManyToOne(() => RequestEntity)
    @JoinColumn({ name: 'request_id' })
    request: RequestEntity;

    @ManyToOne(() => TechnicianEntity)
    @JoinColumn({ name: 'technician_id' })
    technician: TechnicianEntity;
}