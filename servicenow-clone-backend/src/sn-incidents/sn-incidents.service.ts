import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SnBaseService } from '../common/sn-base.service';
import { SnIncidentEntity } from './sn-incident.entity';

@Injectable()
export class SnIncidentsService extends SnBaseService<SnIncidentEntity> {
  protected readonly SN_TABLE = 'incident';

  constructor(
    @InjectRepository(SnIncidentEntity)
    private readonly incidentRepo: Repository<SnIncidentEntity>,
  ) {
    super();
  }

  protected get repository() {
    return this.incidentRepo;
  }
}
