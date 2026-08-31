import { Controller, Post, Body, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { UserPolicyService } from '../services/user-policy.service';
import { AssignUserPolicyDto } from '../dtos';

@Controller('user-policies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserPolicyController {
    constructor(private readonly service: UserPolicyService) { }

    @Post()
    @Roles('admin')
    async assign(@Body() dto: AssignUserPolicyDto) {
        return this.service.assign(dto);
    }

    @Get(':userId')
    @Roles('admin')
    async getPolicies(@Param('userId') userId: string) {
        return this.service.findPoliciesForUser(userId);
    }

    @Delete(':userId/:policyId')
    @Roles('admin')
    async remove(
        @Param('userId') userId: string,
        @Param('policyId') policyId: string,
    ) {
        return this.service.remove(userId, policyId);
    }
}
