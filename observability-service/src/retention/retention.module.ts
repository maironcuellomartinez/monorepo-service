import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { RetentionService } from './retention.service';

@Module({
    imports: [PersistenceModule],
    providers: [RetentionService],
})
export class RetentionModule {}
