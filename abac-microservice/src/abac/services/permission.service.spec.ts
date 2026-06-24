import { Test, TestingModule } from '@nestjs/testing';
import { PermissionService } from './permission.service';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Permission } from '../../entities/permission.entity';
import { AuditService } from './audit.service';
import { LoggerService } from '../../observability';
import { ConflictException } from '@nestjs/common';

describe('PermissionService', () => {
    let service: PermissionService;
    let dataSource: DataSource;
    let permissionRepository: Repository<Permission>;
    let auditService: AuditService;
    let logger: LoggerService;

    const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        },
    };

    const mockDataSource = {
        createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const mockRepository = {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
            andWhere: jest.fn().mockReturnThis(),
            distinct: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        })),
    };

    const mockAuditService = {
        logCrudEvent: jest.fn(),
    };

    const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionService,
                { provide: DataSource, useValue: mockDataSource },
                { provide: getRepositoryToken(Permission), useValue: mockRepository },
                { provide: AuditService, useValue: mockAuditService },
                { provide: LoggerService, useValue: mockLogger },
            ],
        }).compile();

        service = module.get<PermissionService>(PermissionService);
        dataSource = module.get<DataSource>(DataSource);
        permissionRepository = module.get<Repository<Permission>>(getRepositoryToken(Permission));
        auditService = module.get<AuditService>(AuditService);
        logger = module.get<LoggerService>(LoggerService);

        jest.clearAllMocks();
    });

    describe('createPermission', () => {
        const createDto = {
            resource: 'user',
            action: 'create',
            description: 'Create user',
            createdBy: 'admin',
        };

        it('should successfully create a permission', async () => {
            // Mock findOne to return null (no existing permission)
            mockRepository.findOne.mockResolvedValueOnce(null);

            const savedPermission = {
                id: 'perm-1',
                ...createDto,
                getPermissionString: jest.fn().mockReturnValue(`${createDto.resource}:${createDto.action}`)
            };
            mockQueryRunner.manager.save.mockResolvedValueOnce(savedPermission);

            const result = await service.createPermission(createDto);

            expect(result).toEqual(savedPermission);
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(auditService.logCrudEvent).toHaveBeenCalled();
        });

        it('should throw ConflictException if permission already exists', async () => {
            // Mock findOne to return existing permission
            mockRepository.findOne.mockResolvedValueOnce({ id: 'perm-1' });

            await expect(service.createPermission(createDto)).rejects.toThrow(ConflictException);
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        });
    });

    describe('getPermissions', () => {
        it('should return paginated permissions', async () => {
            const permissions = [{ id: 'perm-1', resource: 'user' }];
            const total = 1;

            const queryBuilder: any = {
                andWhere: jest.fn().mockReturnThis(),
                distinct: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                addOrderBy: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                take: jest.fn().mockReturnThis(),
                getManyAndCount: jest.fn().mockResolvedValue([permissions, total]),
            };
            mockRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

            const result = await service.getPermissions({ page: 1, limit: 10 });

            expect(result).toEqual({ permissions, total });
            expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
        });
    });
});
