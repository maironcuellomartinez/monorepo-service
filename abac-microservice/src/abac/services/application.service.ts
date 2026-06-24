import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Application } from '../../entities/application.entity';
import { User } from '../../entities/user.entity';
import { LoggerService } from '../../observability';
import { JwtEd25519Service } from '../../common/crypto/jwt-ed25519.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ApplicationService {
    constructor(
        @InjectRepository(Application)
        private applicationRepository: Repository<Application>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private dataSource: DataSource,
        private logger: LoggerService,
    ) { }

    /**
     * Creates a new application.
     * @param createDto Data to create the application.
     * @returns The created application.
     */
    async createApplication(createDto: {
        name: string;
        description?: string;
        environment?: string;
        settings?: Record<string, any>;
        tokenDurationDays?: number;
        createdBy: string;
    }): Promise<Application> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Verificar si la aplicación ya existe
            const existingApp = await this.applicationRepository.findOne({
                where: { name: createDto.name }
            });

            if (existingApp) {
                throw new ConflictException('Ya existe una aplicación con este nombre');
            }

            // Generar API Key y Secret
            const apiKey = this.generateApiKey();
            const apiSecret = this.generateApiSecret();
            const apiSecretHash = await bcrypt.hash(apiSecret, 10);

            const application = this.applicationRepository.create({
                ...createDto,
                apiKey,
                apiSecret: apiSecretHash,
            });

            const savedApp = await queryRunner.manager.save(application);
            await queryRunner.commitTransaction();

            this.logger.log('Aplicación creada', 'APPLICATION', {
                appId: savedApp.id,
                appName: savedApp.name,
            });

            // Devolver el secret en plaintext solo esta vez — no se puede recuperar después
            savedApp.apiSecret = apiSecret;
            return savedApp;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al crear aplicación', 'APPLICATION', (error as Error).stack, {
                error: (error as Error).message,
                dto: createDto,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Regenerates the API Key and Secret for an application.
     * @param appId The ID of the application.
     * @param updatedBy The user who requested the regeneration.
     * @returns The updated application.
     */
    async regenerateApiKey(appId: string, updatedBy: string): Promise<Application> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const application = await queryRunner.manager.findOne(Application, {
                where: { id: appId }
            });

            if (!application) {
                throw new NotFoundException('Aplicación no encontrada');
            }

            const newApiKey = this.generateApiKey();
            const newApiSecret = this.generateApiSecret();
            const newApiSecretHash = await bcrypt.hash(newApiSecret, 10);

            application.apiKey = newApiKey;
            application.apiSecret = newApiSecretHash;

            const updatedApp = await queryRunner.manager.save(application);
            await queryRunner.commitTransaction();

            this.logger.log('API Key regenerada', 'APPLICATION', {
                appId,
                updatedBy,
            });

            // Devolver el secret en plaintext solo esta vez — no se puede recuperar después
            updatedApp.apiKey = newApiKey;
            updatedApp.apiSecret = newApiSecret;
            return updatedApp;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al regenerar API Key', 'APPLICATION', (error as Error).stack, {
                appId,
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Retrieves a list of applications based on filters.
     * @param filters Filters to apply (isActive, environment, page, limit).
     * @returns A list of applications and the total count.
     */
    async getApplications(filters: {
        isActive?: boolean;
        environment?: string;
        page?: number;
        limit?: number;
    } = {}): Promise<{ applications: Application[]; total: number }> {
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const skip = (page - 1) * limit;

        const query = this.applicationRepository.createQueryBuilder('app');

        if (filters.isActive !== undefined) {
            query.andWhere('app.isActive = :isActive', { isActive: filters.isActive });
        }

        if (filters.environment) {
            query.andWhere('app.environment = :environment', { environment: filters.environment });
        }

        const [applications, total] = await query
            .orderBy('app.createdAt', 'DESC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        // Enmascarar API Keys en la respuesta
        applications.forEach(app => {
            app.apiKey = app.getMaskedApiKey();
            app.apiSecret = '••••••••';
        });

        return { applications, total };
    }

    /**
     * Validates an API Key and optionally the API Secret.
     * @param apiKey The API Key to validate.
     * @param apiSecret The API Secret to validate (optional).
     * @returns The application if valid, null otherwise.
     */
    async validateApiKey(apiKey: string, apiSecret?: string): Promise<Application | null> {
        const application = await this.applicationRepository.findOne({
            where: {
                apiKey,
                isActive: true
            },
            select: ['id', 'name', 'apiKey', 'apiSecret', 'environment', 'isActive', 'settings']
        });

        if (!application) {
            return null;
        }

        if (apiSecret && application.apiSecret) {
            const isValid = await bcrypt.compare(apiSecret, application.apiSecret);
            if (!isValid) return null;
        }

        return application;
    }

    /**
     * Crea un cliente OAuth 2.0 (type='oauth_client') vinculado a una App Nativa.
     * Si la app nativa no tiene service account, lo crea automáticamente.
     * Devuelve client_id y client_secret en plaintext — solo esta vez.
     */
    async createOAuthClient(dto: {
        name: string;
        description?: string;
        ownerApplicationId: string;
        scopes: string[];
        tokenDurationDays?: number;
    }): Promise<any> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const existingApp = await this.applicationRepository.findOne({
                where: { name: dto.name },
            });
            if (existingApp) {
                throw new ConflictException('Ya existe una aplicación con este nombre');
            }

            // Resolver la app nativa
            const nativeApp = await queryRunner.manager.findOne(Application, {
                where: { id: dto.ownerApplicationId, type: 'internal' },
            });
            if (!nativeApp) {
                throw new NotFoundException(`App nativa '${dto.ownerApplicationId}' no encontrada o no es de tipo 'internal'`);
            }

            // Obtener o crear service account para la app nativa
            let ownerId = nativeApp.ownerId;
            if (!ownerId) {
                const slug = nativeApp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const email = `svc-${slug}@apps.internal`;
                let serviceUser = await queryRunner.manager.findOne(User, { where: { email } });
                if (!serviceUser) {
                    serviceUser = queryRunner.manager.create(User, {
                        email,
                        username: `svc-${slug}`,
                        firstName: nativeApp.name,
                        lastName: 'Service Account',
                        accountType: 'service',
                        passwordHash: crypto.randomBytes(32).toString('hex'),
                        status: 'active',
                    });
                    serviceUser = await queryRunner.manager.save(serviceUser);
                }
                nativeApp.ownerId = serviceUser.id;
                await queryRunner.manager.save(nativeApp);
                ownerId = serviceUser.id;
                this.logger.log('Service account auto-creado para app nativa', 'APPLICATION', {
                    appId: nativeApp.id, appName: nativeApp.name, serviceUserId: ownerId,
                });
            }

            const clientId = this.generateClientId();
            const clientSecret = this.generateClientSecret();
            const clientSecretHash = await bcrypt.hash(clientSecret, 10);

            const application = this.applicationRepository.create({
                name: dto.name,
                description: dto.description,
                ownerId,
                ownerApplicationId: dto.ownerApplicationId,
                scopes: dto.scopes,
                tokenDurationDays: dto.tokenDurationDays ?? 180,
                type: 'oauth_client',
                clientId,
                clientSecret: clientSecretHash,
                apiKey: null,
                apiSecret: null,
            });

            const savedApp = await queryRunner.manager.save(application);
            await queryRunner.commitTransaction();

            this.logger.log('OAuth client creado', 'APPLICATION', {
                appId: savedApp.id,
                appName: savedApp.name,
                ownerApplicationId: dto.ownerApplicationId,
                scopes: dto.scopes,
            });

            return {
                id: savedApp.id,
                name: savedApp.name,
                client_id: clientId,
                client_secret: clientSecret,
                scopes: dto.scopes,
                type: 'oauth_client',
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Error al crear OAuth client', 'APPLICATION', (error as Error).stack, {
                error: (error as Error).message,
            });
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async updateApplication(
        appId: string,
        dto: { name?: string; description?: string; environment?: string; settings?: Record<string, any>; ownerApplicationId?: string | null },
    ): Promise<Application> {
        const application = await this.applicationRepository.findOne({ where: { id: appId } });
        if (!application) throw new NotFoundException('Aplicación no encontrada');

        if (dto.name && dto.name !== application.name) {
            const existing = await this.applicationRepository.findOne({ where: { name: dto.name } });
            if (existing) throw new ConflictException('Ya existe una aplicación con ese nombre');
            application.name = dto.name;
        }
        if (dto.description !== undefined) application.description = dto.description;
        if (dto.environment !== undefined) application.environment = dto.environment;
        if (dto.settings !== undefined) application.settings = dto.settings;

        if (application.type === 'm2m_service' && Object.prototype.hasOwnProperty.call(dto, 'ownerApplicationId')) {
            if (dto.ownerApplicationId) {
                const nativeApp = await this.applicationRepository.findOne({
                    where: { id: dto.ownerApplicationId, type: 'internal' },
                });
                if (!nativeApp) throw new NotFoundException(`App nativa '${dto.ownerApplicationId}' no encontrada`);
            }
            application.ownerApplicationId = dto.ownerApplicationId ?? null;
        }

        await this.applicationRepository.save(application);

        this.logger.log('Aplicación actualizada', 'APPLICATION', { appId });

        application.apiKey = application.getMaskedApiKey();
        application.apiSecret = '••••••••';
        return application;
    }

    async reactivateApplication(appId: string): Promise<void> {
        const application = await this.applicationRepository.findOne({ where: { id: appId } });
        if (!application) throw new NotFoundException('Aplicación no encontrada');

        application.isActive = true;
        application.status = 'active';
        await this.applicationRepository.save(application);

        this.logger.log('Aplicación reactivada', 'APPLICATION', { appId });
    }

    async deactivateApplication(appId: string): Promise<void> {
        const application = await this.applicationRepository.findOne({ where: { id: appId } });
        if (!application) throw new NotFoundException('Aplicación no encontrada');

        application.isActive = false;
        application.status = 'inactive';
        await this.applicationRepository.save(application);

        this.logger.log('Aplicación desactivada', 'APPLICATION', { appId });
    }

    /**
     * Elimina permanentemente una aplicación (hard delete).
     * Solo permitido si la aplicación ya está desactivada (isActive=false).
     * Elimina en cascada: UserRole, UserApplication, Role, Policy asociados.
     */
    async deleteApplication(appId: string): Promise<void> {
        const application = await this.applicationRepository.findOne({ where: { id: appId } });
        if (!application) throw new NotFoundException('Aplicación no encontrada');

        if (application.isActive) {
            throw new BadRequestException('Desactivar la aplicación antes de eliminarla');
        }

        await this.dataSource.transaction(async (manager) => {
            // Eliminar en orden para respetar FK constraints
            await manager.query('DELETE FROM user_roles WHERE applicationId = ?', [appId]);
            await manager.query('DELETE FROM user_applications WHERE applicationId = ?', [appId]);
            await manager.query('DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE applicationId = ?)', [appId]);
            await manager.query('DELETE FROM roles WHERE applicationId = ?', [appId]);
            await manager.query('DELETE FROM policy_permissions WHERE policyId IN (SELECT id FROM policies WHERE applicationId = ?)', [appId]);
            await manager.query('DELETE FROM policy_rules WHERE policyId IN (SELECT id FROM policies WHERE applicationId = ?)', [appId]);
            await manager.query('DELETE FROM policies WHERE applicationId = ?', [appId]);
            await manager.query('DELETE FROM applications WHERE id = ?', [appId]);
        });

        this.logger.log('Aplicación eliminada permanentemente', 'APPLICATION', {
            appId,
            appName: application.name,
            type: application.type,
        });
    }

    /**
     * Busca una aplicación por ID. Enmascara las credenciales en la respuesta.
     */
    async getApplicationById(appId: string): Promise<Application> {
        const application = await this.applicationRepository.findOne({
            where: { id: appId },
        });

        if (!application) {
            throw new NotFoundException('Aplicación no encontrada');
        }

        application.apiKey = application.getMaskedApiKey();
        application.apiSecret = '••••••••';
        return application;
    }

    /**
     * Actualiza los scopes permitidos de un OAuth client.
     * Solo aplica a aplicaciones tipo 'oauth_client'.
     */
    async updateScopes(appId: string, scopes: string[]): Promise<any> {
        const application = await this.applicationRepository.findOne({
            where: { id: appId },
        });

        if (!application) {
            throw new NotFoundException('Aplicación no encontrada');
        }

        if (application.type !== 'oauth_client') {
            throw new BadRequestException('Solo se pueden actualizar los scopes de aplicaciones tipo oauth_client');
        }

        application.scopes = scopes;
        await this.applicationRepository.save(application);

        this.logger.log('Scopes actualizados', 'APPLICATION', { appId, scopes });

        return {
            id: application.id,
            name: application.name,
            scopes: application.scopes,
        };
    }

    /**
     * Rota SOLO el client_secret de un OAuth client. El client_id no cambia.
     */
    async rotateClientSecret(appId: string, updatedBy: string): Promise<any> {
        const application = await this.applicationRepository.findOne({
            where: { id: appId },
        });

        if (!application) {
            throw new NotFoundException('Aplicación no encontrada');
        }

        if (application.type !== 'oauth_client') {
            throw new ConflictException('Solo se puede rotar el secret de aplicaciones tipo oauth_client');
        }

        const newSecret = this.generateClientSecret();
        const newSecretHash = await bcrypt.hash(newSecret, 10);

        application.clientSecret = newSecretHash;
        await this.applicationRepository.save(application);

        this.logger.log('OAuth client_secret rotado', 'APPLICATION', { appId, updatedBy });

        return {
            id: application.id,
            name: application.name,
            client_id: application.clientId,  // sin cambios
            client_secret: newSecret,          // nuevo secret en plaintext — solo esta vez
            scopes: application.scopes,
        };
    }

    /**
     * Registra un servicio de infraestructura (type='m2m_service').
     * No crea service account — el applicationId es la identidad del servicio.
     * El JWT usa applicationId como sub. Sin apiKey/apiSecret.
     */
    async createM2mService(dto: {
        name: string;
        description?: string;
        ownerApplicationId?: string;
        tokenDurationDays?: number;
    }): Promise<Application> {
        const existing = await this.applicationRepository.findOne({ where: { name: dto.name } });
        if (existing) throw new ConflictException('Ya existe una aplicación con este nombre');

        if (dto.ownerApplicationId) {
            const nativeApp = await this.applicationRepository.findOne({
                where: { id: dto.ownerApplicationId, type: 'internal' },
            });
            if (!nativeApp) {
                throw new NotFoundException(`App nativa '${dto.ownerApplicationId}' no encontrada o no es de tipo 'internal'`);
            }
        }

        const service = this.applicationRepository.create({
            name: dto.name,
            description: dto.description,
            ownerId: null,
            ownerApplicationId: dto.ownerApplicationId ?? null,
            tokenDurationDays: dto.tokenDurationDays ?? 365,
            type: 'm2m_service',
            apiKey: null,
            apiSecret: null,
            clientId: null,
            clientSecret: null,
        });

        const saved = await this.applicationRepository.save(service);

        this.logger.log('Servicio M2M registrado', 'APPLICATION', {
            appId: saved.id,
            appName: saved.name,
            ownerApplicationId: dto.ownerApplicationId ?? null,
        });

        return saved;
    }

    /**
     * Emite un JWT M2M de larga duración para un servicio de infraestructura.
     * Solo aplica a type='m2m_service'. El token se muestra una sola vez — debe
     * copiarse al .env del servicio como ABAC_M2M_TOKEN.
     */
    async issueM2mToken(appId: string, issuedBy?: string, durationDaysOverride?: number): Promise<{ token: string; expiresAt: Date; applicationName: string; durationDays: number }> {
        const application = await this.applicationRepository.findOne({
            where: { id: appId },
        });

        if (!application) throw new NotFoundException('Aplicación no encontrada');
        if (application.type !== 'm2m_service') {
            throw new BadRequestException('Solo se puede emitir token para servicios tipo m2m_service');
        }

        const ownerApplicationId: string | null = application.ownerApplicationId ?? null;

        const durationDays = durationDaysOverride ?? application.tokenDurationDays ?? 365;
        const expiresInSeconds = durationDays * 24 * 60 * 60;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        // Persistir la duración efectiva para que el dashboard la refleje
        if (durationDays !== application.tokenDurationDays) {
            await this.applicationRepository.update(appId, { tokenDurationDays: durationDays });
        }

        const privateKey = process.env.ED25519_PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('ED25519_PRIVATE_KEY no configurado — requerido para emitir tokens M2M');
        }

        const payload: Record<string, any> = {
            sub:             application.id,
            type:            'service',
            applicationId:   application.id,
            applicationName: application.name,
            accountType:     'service',
            iss:             process.env.JWT_ISSUER ?? 'abac-service',
            aud:             process.env.JWT_AUDIENCE ?? 'abac-clients',
        };

        if (ownerApplicationId) {
            payload['ownerApplicationId'] = ownerApplicationId;
        }

        const token = JwtEd25519Service.signWithKey(
            privateKey,
            { payload, expiresIn: expiresInSeconds },
            { kid: process.env.ED25519_KID },
        );

        this.logger.log('JWT M2M emitido para servicio infra', 'APPLICATION', {
            appId,
            appName: application.name,
            durationDays,
            issuedBy,
        });

        return { token, expiresAt, applicationName: application.name, durationDays };
    }

    private generateApiKey(): string {
        return `ak_${crypto.randomBytes(24).toString('hex')}`;
    }

    private generateApiSecret(): string {
        return `sec_${crypto.randomBytes(32).toString('hex')}`;
    }

    private generateClientId(): string {
        return `cid_${crypto.randomBytes(16).toString('hex')}`;
    }

    private generateClientSecret(): string {
        return `csec_${crypto.randomBytes(32).toString('hex')}`;
    }
}