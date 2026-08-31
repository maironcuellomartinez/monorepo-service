import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CreatePolicyDto, CreatePolicyRuleDto, PolicyFilters, UpdatePolicyDto } from '../dtos/policy-request.dto';
import { PolicyService } from '../services/policy.service';
import { Permissions } from '../decorators/permission.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TrackPerformance, BusinessMetric } from '../../observability';

@ApiTags('Policies')
@ApiBearerAuth()
@Controller('policies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PolicyController {
    constructor(private policyService: PolicyService) { }

    /**
     * Creates a new policy.
     * @param dto Data to create the policy.
     * @returns The created policy.
    */
    @Post()
    @ApiOperation({ summary: 'Crear una nueva política' })
    @ApiResponse({ status: 201, description: 'Política creada exitosamente' })
    @TrackPerformance()
    @BusinessMetric('policy_create', { endpoint: 'create' })
    @Permissions('policy:create')
    @Roles('admin')
    async createPolicy(@Body() dto: CreatePolicyDto) {
        return this.policyService.createPolicy(dto);
    }

    /**
     * Retrieves policies for an application based on filters.
     * @param applicationId The ID of the application.
     * @param filters Filters to apply (type, effect, isActive, searchTerm, page, limit).
     * @returns A list of policies and the total count.
     */
    @Get()
    @ApiOperation({ summary: 'Obtener políticas. Sin applicationId devuelve todas.' })
    @ApiQuery({ name: 'applicationId', required: false })
    @ApiQuery({ name: 'type', required: false })
    @ApiQuery({ name: 'effect', required: false })
    @ApiQuery({ name: 'isActive', required: false })
    @ApiQuery({ name: 'searchTerm', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @Permissions('policy:read')
    @Roles('admin')
    async getPolicies(
        @Query('applicationId') applicationId: string | undefined,
        @Query() filters: PolicyFilters
    ) {
        return this.policyService.getPolicies(applicationId, filters);
    }

    /**
     * Retrieves a policy by its ID.
     * @param id The ID of the policy.
     * @returns The policy details.
     */
    @Get(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Obtener política por ID' })
    async getPolicyById(@Param('id') id: string) {
        return this.policyService.getPolicyById(id);
    }

    /**
     * Updates an existing policy.
     * @param id The ID of the policy.
     * @param updatePolicyDto Data to update the policy.
     * @returns The updated policy.
     */
    @Put(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Actualizar política' })
    async updatePolicy(
        @Param('id') id: string,
        @Body() updatePolicyDto: UpdatePolicyDto
    ) {
        return this.policyService.updatePolicy(id, updatePolicyDto);
    }

    /**
     * Deactivates a policy (soft delete).
     * @param id The ID of the policy.
     * @param deletedBy The user who is deactivating the policy.
     */
    @Delete(':id')
    @Roles('admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar política' })
    async deactivatePolicy(
        @Param('id') id: string,
        @Body('deletedBy') deletedBy: string
    ) {
        return this.policyService.deactivatePolicy(id, deletedBy);
    }

    /**
     * Reactivates a disabled policy.
     * @param id The ID of the policy.
     * @param reactivatedBy The user who is reactivating the policy.
     */
    @Post(':id/reactivate')
    @Roles('admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Reactivar política' })
    async reactivatePolicy(
        @Param('id') id: string,
        @Body('reactivatedBy') reactivatedBy: string
    ) {
        return this.policyService.reactivatePolicy(id, reactivatedBy);
    }

    /**
     * Adds a rule to a policy.
     * @param policyId The ID of the policy.
     * @param createRuleDto Data to create the rule.
     * @returns The created rule.
     */
    @Post(':id/rules')
    @Roles('admin')
    @ApiOperation({ summary: 'Agregar regla a política' })
    async addPolicyRule(
        @Param('id') policyId: string,
        @Body() createRuleDto: CreatePolicyRuleDto
    ) {
        return this.policyService.addPolicyRule(policyId, createRuleDto);
    }

    /**
     * Retrieves rules for a policy.
     * @param policyId The ID of the policy.
     * @returns A list of rules.
     */
    @Get(':id/rules')
    @Roles('admin')
    @ApiOperation({ summary: 'Obtener reglas de política' })
    async getPolicyRules(@Param('id') policyId: string) {
        return this.policyService.getPolicyRules(policyId);
    }

    /**
     * Deletes a rule from a policy.
     * @param ruleId The ID of the rule.
     * @param deletedBy The user who is deleting the rule.
     */
    @Delete('rules/:ruleId')
    @Roles('admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar regla de política' })
    async deletePolicyRule(
        @Param('ruleId') ruleId: string,
        @Body('deletedBy') deletedBy: string
    ) {
        return this.policyService.deletePolicyRule(ruleId, deletedBy);
    }

    /**
     * Adds a permission to a policy.
     * @param policyId The ID of the policy.
     * @param permissionId The ID of the permission.
     * @param createdBy The user who is adding the permission.
     * @param conditions Optional conditions for the permission.
     * @returns The created policy-permission relation.
     */
    @Post(':id/permissions/:permissionId')
    @Roles('admin')
    @ApiOperation({ summary: 'Agregar permiso a política' })
    async addPermissionToPolicy(
        @Param('id') policyId: string,
        @Param('permissionId') permissionId: string,
        @Body('createdBy') createdBy: string,
    ) {
        return this.policyService.addPermissionToPolicy(policyId, permissionId, createdBy);
    }

    /**
     * Retrieves permissions for a policy.
     * @param policyId The ID of the policy.
     * @returns A list of permissions.
     */
    @Get(':id/permissions')
    @Roles('admin')
    @ApiOperation({ summary: 'Obtener permisos de política' })
    async getPolicyPermissions(@Param('id') policyId: string) {
        return this.policyService.getPolicyPermissions(policyId);
    }

    /**
     * Removes a permission from a policy.
     * @param policyId The ID of the policy.
     * @param permissionId The ID of the permission.
     * @param deletedBy The user who is removing the permission.
     */
    @Delete(':id/permissions/:permissionId')
    @Roles('admin')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Remover permiso de política' })
    async removePermissionFromPolicy(
        @Param('id') policyId: string,
        @Param('permissionId') permissionId: string,
        @Body('deletedBy') deletedBy: string
    ) {
        return this.policyService.removePermissionFromPolicy(policyId, permissionId, deletedBy);
    }

    /**
     * Validates a rule condition structure.
     * @param condition The condition to validate.
     * @returns Validation result.
     */
    @Post('validate-rule')
    @Roles('admin')
    @ApiOperation({ summary: 'Validar condición de regla' })
    async validateRuleCondition(@Body('condition') condition: any) {
        return this.policyService.validateRuleCondition(condition);
    }
}
