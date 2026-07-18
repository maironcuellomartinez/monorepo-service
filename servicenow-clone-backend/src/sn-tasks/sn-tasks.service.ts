import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SnBaseService } from '../common/sn-base.service';
import { SnTaskEntity } from './sn-task.entity';

@Injectable()
export class SnTasksService extends SnBaseService<SnTaskEntity> {
  protected readonly SN_TABLE = 'sc_task';

  constructor(
    @InjectRepository(SnTaskEntity)
    private readonly taskRepo: Repository<SnTaskEntity>,
  ) {
    super();
  }

  protected get repository() {
    return this.taskRepo;
  }
}
