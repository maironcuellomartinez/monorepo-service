import { Action } from 'src/common';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('snow_request_logs')
export class SnowRequestLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    snowRequestId: number;

    @Column()
    correlationId: string;

    @Column({ type: 'enum', enum: Action })
    action: Action;

    @Column({ nullable: true })
    statusCode: number;

    @Column({ nullable: true })
    message: string;

    @CreateDateColumn()
    createdAt: Date;
}
