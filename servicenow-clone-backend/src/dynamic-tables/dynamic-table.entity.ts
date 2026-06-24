import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { DynamicField } from './dynamic-field.entity';

@Entity()
export class DynamicTable extends BaseEntity {
    @Column({ unique: true })
    name: string;

    @Column()
    label: string;

    @Column({ default: '' })
    description: string;

    @OneToMany(() => DynamicField, field => field.table)
    fields: DynamicField[];
}