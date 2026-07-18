import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SnCategoryEntity } from './sn-category.entity';

export interface CreateCategoryDto {
  value: string;
  label: string;
  parent_id?: string | null;
  type?: 'category' | 'close_category';
  table_name?: string;
  position?: number;
}

export interface CategoryNode {
  id: string;
  value: string;
  label: string;
  type: string;
  table_name: string;
  position: number;
  subcategories?: CategoryNode[];
}

@Injectable()
export class SnCategoriesService {
  constructor(
    @InjectRepository(SnCategoryEntity)
    private readonly repo: Repository<SnCategoryEntity>,
  ) {}

  /** Árbol de categorías normales (no close) por tabla, anidando subcategorías */
  async getTree(tableName?: string): Promise<CategoryNode[]> {
    const where: FindOptionsWhere<SnCategoryEntity> = {
      is_active: true,
      type: 'category',
      parent_id: IsNull(),
    };
    if (tableName) where.table_name = tableName;

    const roots = await this.repo.find({ where, order: { position: 'ASC' } });
    const all = await this.repo.find({
      where: { is_active: true, type: 'category' },
      order: { position: 'ASC' },
    });

    return roots.map((root) => ({
      id: root.id,
      value: root.value,
      label: root.label,
      type: root.type,
      table_name: root.table_name,
      position: root.position,
      subcategories: all
        .filter((c) => c.parent_id === root.id)
        .map((c) => ({
          id: c.id,
          value: c.value,
          label: c.label,
          type: c.type,
          table_name: c.table_name,
          position: c.position,
        })),
    }));
  }

  /** Lista plana de categorías activas (para pickers) */
  async findFlat(
    tableName?: string,
    type?: string,
  ): Promise<SnCategoryEntity[]> {
    const where: FindOptionsWhere<SnCategoryEntity> = { is_active: true };
    if (tableName) where.table_name = tableName;
    if (type) where.type = type as 'category' | 'close_category';
    return this.repo.find({ where, order: { position: 'ASC' } });
  }

  async findById(id: string): Promise<SnCategoryEntity> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }

  async create(dto: CreateCategoryDto): Promise<SnCategoryEntity> {
    const entity = this.repo.create({
      id: randomUUID(),
      value: dto.value,
      label: dto.label,
      parent_id: dto.parent_id ?? null,
      type: dto.type ?? 'category',
      table_name: dto.table_name ?? 'incident',
      position: dto.position ?? 0,
      is_active: true,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: Partial<CreateCategoryDto>,
  ): Promise<SnCategoryEntity> {
    const cat = await this.findById(id);
    Object.assign(cat, dto);
    return this.repo.save(cat);
  }

  async deactivate(id: string): Promise<void> {
    const cat = await this.findById(id);
    cat.is_active = false;
    await this.repo.save(cat);
  }

  async seedDefaults(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) return;

    const incidentCategories = [
      {
        value: 'hardware',
        label: 'Hardware',
        position: 1,
        subs: [
          'computer|Computadora',
          'peripheral|Periférico',
          'monitor|Monitor',
          'printer|Impresora',
          'mobile|Dispositivo Móvil',
        ],
      },
      {
        value: 'software',
        label: 'Software',
        position: 2,
        subs: [
          'os|Sistema Operativo',
          'application|Aplicación Corporativa',
          'office|Office Suite',
          'antivirus|Antivirus/Seguridad',
        ],
      },
      {
        value: 'network',
        label: 'Red',
        position: 3,
        subs: [
          'connectivity|Conectividad',
          'vpn|VPN',
          'email|Email',
          'dns|DNS',
        ],
      },
      {
        value: 'access',
        label: 'Acceso',
        position: 4,
        subs: [
          'password|Contraseña/Bloqueo',
          'permissions|Permisos',
          'certificate|Certificado',
        ],
      },
      {
        value: 'general',
        label: 'General IT',
        position: 5,
        subs: ['other|Otro'],
      },
    ];

    for (const cat of incidentCategories) {
      const parent = await this.create({
        value: cat.value,
        label: cat.label,
        table_name: 'incident',
        position: cat.position,
      });
      for (let i = 0; i < cat.subs.length; i++) {
        const [val, lbl] = cat.subs[i].split('|');
        await this.create({
          value: val,
          label: lbl,
          parent_id: parent.id,
          table_name: 'incident',
          position: i + 1,
        });
      }
    }

    const closeCategories = [
      { value: 'solution_provided', label: 'Solución Provista', position: 1 },
      { value: 'no_action', label: 'Sin Acción Requerida', position: 2 },
      { value: 'user_training', label: 'Capacitación al Usuario', position: 3 },
      { value: 'duplicate', label: 'Duplicado', position: 4 },
      { value: 'known_error', label: 'Error Conocido', position: 5 },
      { value: 'workaround', label: 'Workaround Provisto', position: 6 },
    ];

    for (const cat of closeCategories) {
      await this.create({
        value: cat.value,
        label: cat.label,
        type: 'close_category',
        table_name: 'incident',
        position: cat.position,
      });
    }
  }
}
