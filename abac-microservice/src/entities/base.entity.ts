// base.entity.ts (Entidad base para herencia)
import { CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, Column } from 'typeorm';

export abstract class BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @CreateDateColumn({ type: 'timestamp', precision: 6 })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamp', precision: 6 })
    updatedAt!: Date;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ type: 'varchar', length: 36, nullable: true })
    createdBy!: string;

    @Column({ type: 'varchar', length: 36, nullable: true })
    updatedBy!: string;
}

export abstract class AuditEntity extends BaseEntity {
    @Column({ type: 'json', nullable: true })
    metadata!: Record<string, any>;
}