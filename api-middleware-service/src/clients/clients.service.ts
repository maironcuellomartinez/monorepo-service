import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ExternalClientEntity } from './entities/external-client.entity';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { CreateClientDto, ClientCredentialsResponseDto, ClientResponseDto } from './dto/create-client.dto';
import { ListClientsDto, PaginatedClientsDto } from './dto/list-clients.dto';

// Dummy hash para bcrypt timing attack mitigation en validateCredentials
const DUMMY_BCRYPT_HASH = '$2b$10$dummy.hash.prevents.timing.enumeration.of.client.ids0000';

@Injectable()
export class ClientsService {
    constructor(
        @InjectRepository(ExternalClientEntity) private readonly repo: Repository<ExternalClientEntity>,
        @InjectRepository(RefreshTokenEntity) private readonly tokenRepo: Repository<RefreshTokenEntity>,
    ) { }

    /**
     * Creates a new external client
     * @param dto Client data to create
     * @returns Credentials for the created client
     * @throws NotFoundException if the client does not exist
     * @throws InternalServerErrorException if the client cannot be created
     * @description This method generates a new client ID and client secret for the given client data and saves it to the database.
     * The client ID is generated using the format `mc_{random_hex}`
     * The client secret is hashed using bcrypt and secret is not stored in plain text in the database.
     * @example
     * ```typescript
     * const client = await this.clientsService.create({
     *  name: 'My Client',
     *  description: 'My Client Description',
     *  scopes: ['read', 'write'],
     *  tokenExpiresInSeconds: 3600,
     * });
     * ```|
    */
    async create(dto: CreateClientDto): Promise<ClientCredentialsResponseDto> {
        const clientId = `mc_${crypto.randomBytes(24).toString('hex')}`;
        const clientSecret = crypto.randomBytes(32).toString('hex');
        const hash = await bcrypt.hash(clientSecret, 10);

        const entity = this.repo.create({
            clientId,
            clientSecretHash: hash,
            name: dto.name,
            description: dto.description ?? null,
            tokenExpiresInSeconds: dto.tokenExpiresInSeconds ?? 3600,
            allowedScopes: dto.scopes && dto.scopes.length > 0 ? dto.scopes : null,
        });
        await this.repo.save(entity);

        return { clientId, clientSecret, name: dto.name, message: 'Guarda el clientSecret — no se puede recuperar.' };
    }

    /**
     * Retrieves all external clients
     * @returns Array of client response DTOs
     * @description This method retrieves all external clients from the database and returns them as an array of client response DTOs.
     * @example
     * ```typescript
     * const clients = await this.clientsService.findAll();
     * ```
     */
    async findAll(query: ListClientsDto = {}): Promise<PaginatedClientsDto<ClientResponseDto>> {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const [entities, total] = await this.repo.findAndCount({
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            data: entities.map(e => this.toDto(e)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Retrieves a single external client by ID
     * @param clientId Client ID to retrieve
     * @returns Client response DTO
     * @throws NotFoundException if the client does not exist
     * @description This method retrieves a single external client from the database by its ID and returns it as a client response DTO.
     * @example
     * ```typescript
     * const client = await this.clientsService.findOne('mc_1234567890abcdef1234567890abcdef');
     * ```
     */
    async findOne(clientId: string): Promise<ClientResponseDto> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);
        return this.toDto(entity);
    }

    /**
     * Updates the token expiry time for a specific client.
     * @param clientId The ID of the client to update.
     * @param tokenExpiresInSeconds The new token expiry time in seconds.
     * @returns The updated client response DTO.
     * @throws NotFoundException if the client does not exist.
     * @description This method updates the token expiry time for a specific client and returns the updated client response DTO.
     * @example
     * ```typescript
     * const client = await this.clientsService.updateTokenExpiry('mc_1234567890abcdef1234567890abcdef', 3600);
     * ```
     */
    async updateTokenExpiry(clientId: string, tokenExpiresInSeconds: number): Promise<ClientResponseDto> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);

        entity.tokenExpiresInSeconds = tokenExpiresInSeconds;
        await this.repo.save(entity);

        return this.toDto(entity);
    }

    /**
     * Rotates the client secret for a specific client.
     * @param clientId The ID of the client to rotate the secret for.
     * @returns The new client credentials.
     * @throws NotFoundException if the client does not exist.
     * @description This method rotates the client secret for a specific client and returns the new client credentials.
     * @example
     * ```typescript
     * const client = await this.clientsService.rotateSecret('mc_1234567890abcdef1234567890abcdef');
     * ```
     */
    async rotateSecret(clientId: string): Promise<ClientCredentialsResponseDto> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);

        const clientSecret = crypto.randomBytes(32).toString('hex');
        entity.clientSecretHash = await bcrypt.hash(clientSecret, 10);
        await this.repo.save(entity);

        return { clientId, clientSecret, name: entity.name, message: 'Secret rotado — guarda el nuevo clientSecret.' };
    }

    /**
     * Deactivates a client by its ID.
     * @param clientId The ID of the client to deactivate.
     * @throws NotFoundException if the client does not exist.
     * @description This method deactivates a client by setting its `isActive` property to `false` and persists the change to the database.
     * @example
     * ```typescript
     * await this.clientsService.deactivate('mc_1234567890abcdef1234567890abcdef');
     * ```
     */
    async deactivate(clientId: string): Promise<void> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);
        entity.isActive = false;
        await this.repo.save(entity);
        // Revocar refresh tokens activos para que no puedan seguir rotando
        await this.tokenRepo.update(
            { clientId, revokedAt: IsNull() },
            { revokedAt: new Date() },
        );
    }

    /**
     * Reactivates a client by its ID.
     * @param clientId The ID of the client to reactivate.
     * @returns The reactivated client response DTO.
     * @throws NotFoundException if the client does not exist.
     * @description This method reactivates a client by setting its `isActive` property to `true` and persists the change to the database.
     * @example
     * ```typescript
     * const client = await this.clientsService.reactivate('mc_1234567890abcdef1234567890abcdef');
     * ```
     */
    async reactivate(clientId: string): Promise<ClientResponseDto> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);
        entity.isActive = true;
        await this.repo.save(entity);
        return this.toDto(entity);
    }

    /**
     * Removes a client by its ID.
     * @param clientId The ID of the client to remove.
     * @throws NotFoundException if the client does not exist.
     * @description This method removes a client by deleting it from the database.
     * @example
     * ```typescript
     * await this.clientsService.remove('mc_1234567890abcdef1234567890abcdef');
     * ```
     */
    async remove(clientId: string): Promise<void> {
        const result = await this.repo.delete({ clientId });
        if (result.affected === 0) throw new NotFoundException(`Client ${clientId} no encontrado`);
        // Revocar refresh tokens activos para que no queden tokens válidos huérfanos
        await this.tokenRepo.update(
            { clientId, revokedAt: IsNull() },
            { revokedAt: new Date() },
        );
    }

    /**
     * Validates client credentials.
     * @param clientId The client ID to validate.
     * @param clientSecret The client secret to validate.
     * @returns The validated client entity if the credentials are valid, null otherwise.
     * @description This method validates client credentials by checking if the provided client ID and client secret match the stored credentials.
     * @example
     * ```typescript
     * const client = await this.clientsService.validateCredentials('mc_1234567890abcdef1234567890abcdef', 'secret');
     * ```
     */
    async validateCredentials(clientId: string, clientSecret: string): Promise<ExternalClientEntity | null> {
        const entity = await this.repo.findOneBy({ clientId, isActive: true });
        if (!entity) {
            // Bcrypt dummy para que el tiempo de respuesta no permita enumerar clientIds válidos
            await bcrypt.compare(clientSecret, DUMMY_BCRYPT_HASH);
            return null;
        }
        const valid = await bcrypt.compare(clientSecret, entity.clientSecretHash);
        return valid ? entity : null;
    }

    /**
     * Converts an external client entity to a client response DTO.
     * @param e The external client entity to convert.
     * @returns The client response DTO.
     * @description This method converts an external client entity to a client response DTO.
     * @example
     * ```typescript
     * const dto = this.clientsService.toDto(entity);
     * ```
     */
    private toDto(e: ExternalClientEntity): ClientResponseDto {
        return {
            clientId: e.clientId,
            name: e.name,
            description: e.description,
            isActive: e.isActive,
            tokenExpiresInSeconds: e.tokenExpiresInSeconds,
            allowedScopes: e.allowedScopes ?? null,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
        };
    }
}
