// src/infrastructure/external/adapters/servicenow.adapter.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ServiceNowIncident {
    short_description: string;
    description: string;
    caller_id: string;
    urgency: string;
    impact: string;
    category: string;
    subcategory: string;
    assignment_group: string;
    correlation_id?: string;
    u_appointment_id?: string;
    u_device_type?: string;
    u_corner_id?: string;
    u_priority?: string;
    comments?: string;
}

@Injectable()
export class ServiceNowAdapter {
    constructor(private readonly configService: ConfigService) { }

    transformToServiceNowFormat(payload: any): ServiceNowIncident {
        const {
            appointmentId,
            userId,
            description,
            deviceType,
            cornerId,
            priority,
            issueType,
            correlationId,
        } = payload;

        // Mapear prioridad a valores de ServiceNow
        const urgency = this.mapPriorityToUrgency(priority);
        const impact = this.mapPriorityToImpact(priority);

        // Determinar categoría y subcategoría
        const { category, subcategory } = this.determineCategory(deviceType, issueType);

        // Determinar grupo de asignación
        const assignmentGroup = this.determineAssignmentGroup(cornerId, deviceType);

        return {
            short_description: this.generateShortDescription(appointmentId, deviceType, issueType),
            description: description || 'No description provided',
            caller_id: userId || 'N/A',
            urgency,
            impact,
            category,
            subcategory,
            assignment_group: assignmentGroup,
            correlation_id: correlationId,
            u_appointment_id: appointmentId,
            u_device_type: deviceType,
            u_corner_id: cornerId,
            u_priority: priority,
            comments: this.generateComments(payload),
        };
    }

    transformFromServiceNowFormat(incident: any): any {
        return {
            incidentNumber: incident.number,
            sysId: incident.sys_id,
            shortDescription: incident.short_description,
            description: incident.description,
            state: incident.state,
            urgency: incident.urgency,
            impact: incident.impact,
            category: incident.category,
            subcategory: incident.subcategory,
            assignmentGroup: incident.assignment_group,
            assignedTo: incident.assigned_to,
            openedAt: incident.opened_at,
            updatedAt: incident.sys_updated_on,
            appointmentId: incident.u_appointment_id,
            deviceType: incident.u_device_type,
            cornerId: incident.u_corner_id,
            priority: incident.u_priority,
            correlationId: incident.correlation_id,
        };
    }

    private generateShortDescription(
        appointmentId: string,
        deviceType: string,
        issueType: string
    ): string {
        const maxLength = 160; // Límite de ServiceNow

        let description = `Appointment ${appointmentId} - ${deviceType} - ${issueType}`;

        if (description.length > maxLength) {
            description = description.substring(0, maxLength - 3) + '...';
        }

        return description;
    }

    private mapPriorityToUrgency(priority: string): string {
        const urgencyMap: Record<string, string> = {
            'CRITICAL': '1',
            'HIGH': '2',
            'MEDIUM': '3',
            'LOW': '4',
        };

        return urgencyMap[priority?.toUpperCase()] || '3';
    }

    private mapPriorityToImpact(priority: string): string {
        const impactMap: Record<string, string> = {
            'CRITICAL': '1',
            'HIGH': '2',
            'MEDIUM': '3',
            'LOW': '4',
        };

        return impactMap[priority?.toUpperCase()] || '3';
    }

    private determineCategory(deviceType: string, issueType: string): {
        category: string;
        subcategory: string;
    } {
        const deviceCategoryMap: Record<string, string> = {
            'LAPTOP': 'Hardware',
            'DESKTOP': 'Hardware',
            'PHONE': 'Hardware',
            'TABLET': 'Hardware',
            'DISPLAY': 'Hardware',
            'PRINTER': 'Hardware',
            'NETWORK': 'Infrastructure',
            'SERVER': 'Infrastructure',
            'SOFTWARE': 'Software',
        };

        const issueSubcategoryMap: Record<string, string> = {
            'REPAIR': 'Repair',
            'MAINTENANCE': 'Maintenance',
            'UPGRADE': 'Upgrade',
            'INSTALLATION': 'Installation',
            'CONFIGURATION': 'Configuration',
            'TROUBLESHOOTING': 'Troubleshooting',
        };

        return {
            category: deviceCategoryMap[deviceType?.toUpperCase()] || 'Hardware',
            subcategory: issueSubcategoryMap[issueType?.toUpperCase()] || 'Repair',
        };
    }

    private determineAssignmentGroup(cornerId: string, deviceType: string): string {
        // Mapear cornerId a grupos de asignación específicos
        const cornerGroupMap: Record<string, string> = {
            'CORNER_NYC': 'NYC IT Support',
            'CORNER_LA': 'LA IT Support',
            'CORNER_CHI': 'Chicago IT Support',
            'CORNER_MIA': 'Miami IT Support',
        };

        // Grupos especializados por tipo de dispositivo
        const deviceGroupMap: Record<string, string> = {
            'PHONE': 'Mobile Device Support',
            'LAPTOP': 'Laptop Support',
            'SERVER': 'Server Team',
            'NETWORK': 'Network Team',
        };

        // Prioridad: dispositivo específico -> corner específico -> default
        if (deviceGroupMap[deviceType?.toUpperCase()]) {
            return deviceGroupMap[deviceType.toUpperCase()];
        }

        if (cornerGroupMap[cornerId?.toUpperCase()]) {
            return cornerGroupMap[cornerId.toUpperCase()];
        }

        return 'IT Support'; // Grupo por defecto
    }

    private generateComments(payload: any): string {
        const comments: string[] = [];

        if (payload.contactPhone) {
            comments.push(`Contact Phone: ${payload.contactPhone}`);
        }

        if (payload.contactEmail) {
            comments.push(`Contact Email: ${payload.contactEmail}`);
        }

        if (payload.scheduledDate) {
            comments.push(`Scheduled Date: ${payload.scheduledDate}`);
        }

        if (payload.estimatedDuration) {
            comments.push(`Estimated Duration: ${payload.estimatedDuration} minutes`);
        }

        if (payload.specialInstructions) {
            comments.push(`Special Instructions: ${payload.specialInstructions}`);
        }

        return comments.join('\n');
    }

    // Método para transformar datos de actualización
    transformUpdateToServiceNowFormat(updates: any): Partial<ServiceNowIncident> {
        const transformed: Partial<ServiceNowIncident> = {};

        if (updates.status) {
            transformed.short_description = `Status updated to ${updates.status}`;
        }

        if (updates.comments) {
            transformed.comments = updates.comments;
        }

        if (updates.assignedTo) {
            transformed.assignment_group = updates.assignedTo;
        }

        if (updates.priority) {
            transformed.urgency = this.mapPriorityToUrgency(updates.priority);
            transformed.impact = this.mapPriorityToImpact(updates.priority);
            transformed.u_priority = updates.priority;
        }

        return transformed;
    }

    // Método para crear un incidente de seguimiento
    createFollowUpIncident(originalIncident: any, followUpReason: string): ServiceNowIncident {
        return {
            short_description: `Follow-up: ${originalIncident.short_description}`,
            description: `Follow-up for incident ${originalIncident.number}:\n${followUpReason}`,
            caller_id: originalIncident.caller_id,
            urgency: originalIncident.urgency,
            impact: originalIncident.impact,
            category: originalIncident.category,
            subcategory: originalIncident.subcategory,
            assignment_group: originalIncident.assignment_group,
            correlation_id: originalIncident.correlation_id,
            u_appointment_id: originalIncident.u_appointment_id,
            u_device_type: originalIncident.u_device_type,
            u_corner_id: originalIncident.u_corner_id,
            u_priority: originalIncident.u_priority,
            comments: `Parent Incident: ${originalIncident.number}\nFollow-up Reason: ${followUpReason}`,
        };
    }
}