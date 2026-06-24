// user-application.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Application } from './application.entity';

@Entity('user_applications')
@Unique(['userId', 'applicationId'])
@Index(['userId', 'isActive'])
@Index(['applicationId', 'isActive'])
export class UserApplication extends BaseEntity {
    @Column({ type: 'uuid' })
    userId!: string;

    @Column({ type: 'uuid' })
    applicationId!: string;

    @Column({ type: 'varchar', length: 50, default: 'member' })
    membershipType!: string;

    @Column({ type: 'timestamp', nullable: true })
    membershipExpiresAt!: Date;

    @Column({ type: 'json', nullable: true })
    attributes!: Record<string, any>;

    @ManyToOne(() => User, (user) => user.userApplications, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'userId' })
    user!: User;

    @ManyToOne(() => Application, (app) => app.userApplications, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'applicationId' })
    application!: Application;
}