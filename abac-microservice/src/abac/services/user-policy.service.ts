import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignUserPolicyDto } from '../dtos/assign-user-policy.dto';
import { UserPolicyAssignment } from 'src/entities/userPolicyAssignment.entity';
import { AbacService } from './abac.service';

@Injectable()
export class UserPolicyService {
    constructor(
        @InjectRepository(UserPolicyAssignment)
        private readonly repo: Repository<UserPolicyAssignment>,
        private readonly abacService: AbacService,
    ) { }

    async assign(dto: AssignUserPolicyDto) {
        const exists = await this.repo.findOne({ where: { user: { id: dto.userId }, policy: { id: dto.policyId } } });
        if (exists) return exists;

        const assignment = this.repo.create({
            user: { id: dto.userId },
            policy: { id: dto.policyId },
        });
        const saved = await this.repo.save(assignment);
        // Una política de usuario puede evaluarse en cualquier aplicación a
        // la que pertenezca — invalidar por app específica requeriría cargar
        // la policy solo para leer su applicationId; más simple y igual de
        // correcto invalidar todas las apps de este usuario.
        await this.abacService.invalidateAllUserCache(dto.userId);
        return saved;
    }

    async remove(userId: string, policyId: string) {
        const assignment = await this.repo.findOne({
            where: { user: { id: userId }, policy: { id: policyId } },
        });
        if (!assignment) return { removed: false };
        await this.repo.remove(assignment);
        await this.abacService.invalidateAllUserCache(userId);
        return { removed: true };
    }

    async findPoliciesForUser(userId: string) {
        return this.repo.find({ where: { user: { id: userId } }, relations: ['policy'] });
    }
}
