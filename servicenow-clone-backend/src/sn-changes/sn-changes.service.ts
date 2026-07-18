import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SnBaseService } from '../common/sn-base.service';
import { SnChangeEntity } from './sn-change.entity';

@Injectable()
export class SnChangesService extends SnBaseService<SnChangeEntity> {
  protected readonly SN_TABLE = 'change_request';

  constructor(
    @InjectRepository(SnChangeEntity)
    private readonly changeRepo: Repository<SnChangeEntity>,
  ) {
    super();
  }

  protected get repository() {
    return this.changeRepo;
  }
}
