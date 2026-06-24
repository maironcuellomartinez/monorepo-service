import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ExternalSystem } from "src/infrastructure/entities/external-system.entity";
import { IExternalSystemRepository } from "src/domain/interfaces/repository.interface";

@Injectable()
export class ExternalSystemRepository implements IExternalSystemRepository {
    constructor(
        @InjectRepository(ExternalSystem)
        private readonly repository: Repository<ExternalSystem>
    ) { }
    async updateCircuitState(id: string, state: string): Promise<void> {
        await this.repository.update(id, { circuitState: state });
    }

    async findAll(): Promise<ExternalSystem[]> {
        return this.repository.find();
    }

    async findById(id: string): Promise<ExternalSystem | null> {
        return this.repository.findOneBy({ id });
    }

    async findBySystem(systemType: string): Promise<ExternalSystem | null> {
        return this.repository.findOneBy({ type: systemType });
    }

    async create(entity: ExternalSystem): Promise<ExternalSystem> {
        return this.repository.save(entity);
    }

    async update(entity: ExternalSystem): Promise<ExternalSystem> {
        return this.repository.save(entity);
    }

    async delete(id: string): Promise<void> {
        await this.repository.delete(id);
    }
}