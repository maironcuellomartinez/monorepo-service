import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('admins')
export class AdminEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ length: 100, unique: true })
    username!: string;

    @Column({ length: 128 })
    passwordHash!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
