import { Entity, Column, ManyToOne } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { DynamicTable } from './dynamic-table.entity';

@Entity()
export class DynamicField extends BaseEntity {
    @Column()
    name: string;

    @Column()
    label: string;

    @Column()
    type: string; // 'string', 'number', 'boolean', 'reference', etc.

    @Column({ default: false })
    mandatory: boolean;

    @Column({ type: 'json', nullable: true })
    options: any;

    @ManyToOne(() => DynamicTable, table => table.fields)
    table: DynamicTable;
}