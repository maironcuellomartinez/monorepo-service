import { User as UserEntity } from '../entities/user.entity';
import { Application as ApplicationEntity } from '../entities/application.entity';

declare module 'express' {
    export interface Request {
        user?: UserEntity;
        application?: ApplicationEntity;
    }
}
