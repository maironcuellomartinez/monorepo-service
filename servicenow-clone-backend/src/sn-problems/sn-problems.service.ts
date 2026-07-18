import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SnBaseService } from '../common/sn-base.service';
import { SnProblemEntity } from './sn-problem.entity';

@Injectable()
export class SnProblemsService extends SnBaseService<SnProblemEntity> {
  protected readonly SN_TABLE = 'problem';

  constructor(
    @InjectRepository(SnProblemEntity)
    private readonly problemRepo: Repository<SnProblemEntity>,
  ) {
    super();
  }

  protected get repository() {
    return this.problemRepo;
  }
}
