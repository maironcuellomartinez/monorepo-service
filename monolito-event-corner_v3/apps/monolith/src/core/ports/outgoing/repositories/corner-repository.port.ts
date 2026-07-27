import { Result } from '@app/result';
import { CORNER_REPOSITORY } from './tokens';
import { Corner } from '@app/core/domain/entities/corner.entity';
import { CornerId } from '@app/shared/types/branded-ids';

export interface ICornerRepository {
    save(corner: Corner): Promise<Result<void>>;
    findById(id: CornerId): Promise<Result<Corner | null>>;
    findByName(name: string): Promise<Result<Corner | null>>;
    findByCode(code: string): Promise<Result<Corner | null>>;
    findAllActive(): Promise<Result<Corner[]>>;
    update(corner: Corner): Promise<Result<void>>;
    delete(id: CornerId): Promise<Result<void>>;
    findByServiceNowLocation(location: string): Promise<Result<Corner[]>>;
}

export { CORNER_REPOSITORY };