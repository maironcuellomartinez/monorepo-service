import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignUserPolicyDto } from '../dtos/assign-user-policy.dto';
import { UserPolicyAssignment } from 'src/entities/userPolicyAssignment.entity';

@Injectable()
export class UserPolicyService {
    constructor(
        @InjectRepository(UserPolicyAssignment)
        private readonly repo: Repository<UserPolicyAssignment>,
    ) { }

    async assign(dto: AssignUserPolicyDto) {
        const exists = await this.repo.findOne({ where: { user: { id: dto.userId }, policy: { id: dto.policyId } } });
        if (exists) return exists;

        const assignment = this.repo.create({
            user: { id: dto.userId },
            policy: { id: dto.policyId },
        });
        return await this.repo.save(assignment);
    }

    async remove(userId: string, policyId: string) {
        const assignment = await this.repo.findOne({
            where: { user: { id: userId }, policy: { id: policyId } },
        });
        if (!assignment) return { removed: false };
        await this.repo.remove(assignment);
        return { removed: true };
    }

    async findPoliciesForUser(userId: string) {
        return this.repo.find({ where: { user: { id: userId } }, relations: ['policy'] });
    }
}
