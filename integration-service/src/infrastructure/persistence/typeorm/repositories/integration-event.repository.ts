import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { IntegrationEvent as OrmIntegrationEvent } from '../../../entities/integration-event.entity';
import { IntegrationEvent } from '../../../../domain/entities/integration-event.entity';
import { IntegrationStatus } from '../../../../domain/value-objects/integration-status.vo';
import { IIntegrationEventRepository } from '../../../../domain/interfaces/repository.interface';

@Injectable()
export class IntegrationEventRepository implements IIntegrationEventRepository {
  constructor(
    @InjectRepository(OrmIntegrationEvent)
    private readonly repository: Repository<OrmIntegrationEvent>,
  ) { }

  async save(event: IntegrationEvent): Promise<IntegrationEvent> {
    const orm = this.toOrm(event);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async update(event: IntegrationEvent): Promise<IntegrationEvent> {
    const orm = this.toOrm(event);
    const saved = await this.repository.save(orm);
    return this.toDomain(saved);
  }

  async findById(id: string): Promise<IntegrationEvent | null> {
    const orm = await this.repository.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByCorrelationId(correlationId: string): Promise<IntegrationEvent | null> {
    const orm = await this.repository.findOne({ where: { correlationId } });
    return orm ? this.toDomain(orm) : null;
  }

  async findPendingEvents(): Promise<IntegrationEvent[]> {
    const rows = await this.repository.find({
      where: { status: 'PENDING' },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    return rows.map(r => this.toDomain(r));
  }

  async findStuckProcessing(olderThanMinutes: number): Promise<IntegrationEvent[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const rows = await this.repository.find({
      where: { status: 'PROCESSING', updatedAt: LessThan(cutoff) },
      order: { updatedAt: 'ASC' },
    });
    return rows.map(r => this.toDomain(r));
  }

  // ── Mapping ──────────────────────────────────────────────────────────────

  private toOrm(domain: IntegrationEvent): OrmIntegrationEvent {
    return Object.assign(new OrmIntegrationEvent(), {
      id: domain.id,
      correlationId: domain.correlationId,
      eventType: domain.eventType,
      source: domain.source,
      payload: domain.payload,
      status: domain.status.toString(),
      steps: domain.steps,
      error: domain.error,
      retryCount: domain.retryCount,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    });
  }

  private toDomain(orm: OrmIntegrationEvent): IntegrationEvent {
    const domain = new IntegrationEvent(orm.eventType, orm.source, orm.payload, orm.correlationId);
    return Object.assign(domain, {
      id: orm.id,
      status: IntegrationStatus.fromString(orm.status),
      steps: orm.steps ?? [],
      error: orm.error,
      retryCount: orm.retryCount,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }
}
