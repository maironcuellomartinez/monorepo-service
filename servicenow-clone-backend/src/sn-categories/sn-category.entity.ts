import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sn_categories')
export class SnCategoryEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  /** Valor que va en el campo category/subcategory del ticket: "hardware", "laptop" */
  @Column({ type: 'varchar', length: 100 })
  value: string;

  /** Nombre legible para el dashboard: "Hardware", "Laptop" */
  @Column({ type: 'varchar', length: 100 })
  label: string;

  /** null = categoría de primer nivel; UUID = subcategoría */
  @Column({ type: 'varchar', length: 36, nullable: true })
  parent_id: string | null;

  @ManyToOne(() => SnCategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: SnCategoryEntity | null;

  /** 'category' = categoría/subcategoría normal; 'close_category' = categoría de cierre */
  @Column({ type: 'varchar', length: 20, default: 'category' })
  type: 'category' | 'close_category';

  /** Tabla SN a la que aplica: 'incident', 'sc_request', 'sc_task', 'change_request', 'problem', 'all' */
  @Column({ type: 'varchar', length: 50, default: 'incident' })
  table_name: string;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
