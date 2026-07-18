import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SnBaseService } from '../common/sn-base.service';
import { SnRequestEntity } from './sn-request.entity';

@Injectable()
export class SnRequestsService extends SnBaseService<SnRequestEntity> {
  protected readonly SN_TABLE = 'sc_request';

  constructor(
    @InjectRepository(SnRequestEntity)
    private readonly requestRepo: Repository<SnRequestEntity>,
  ) {
    super();
  }

  protected get repository() {
    return this.requestRepo;
  }
}
