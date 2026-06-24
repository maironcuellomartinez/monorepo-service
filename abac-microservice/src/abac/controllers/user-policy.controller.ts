import { Controller, Post, Body, Get, Delete, Param } from '@nestjs/common';
import { UserPolicyService } from '../services/user-policy.service';
import { AssignUserPolicyDto } from '../dtos';

@Controller('user-policies')
export class UserPolicyController {
    constructor(private readonly service: UserPolicyService) { }

    @Post()
    async assign(@Body() dto: AssignUserPolicyDto) {
        return this.service.assign(dto);
    }

    @Get(':userId')
    async getPolicies(@Param('userId') userId: string) {
        return this.service.findPoliciesForUser(userId);
    }

    @Delete(':userId/:policyId')
    async remove(
        @Param('userId') userId: string,
        @Param('policyId') policyId: string,
    ) {
        return this.service.remove(userId, policyId);
    }
}
