// dto/assign-user-policy.dto.ts
import { IsUUID } from 'class-validator';

export class AssignUserPolicyDto {
    @IsUUID()
    userId!: string;

    @IsUUID()
    policyId!: string;
}
