// src/outlook-calendar/calendar.adapter.ts
import { Injectable } from '@nestjs/common';
import { OutlookEvent } from './outlook-calendar.connector';

@Injectable()
export class CalendarAdapter {
    // Transformar a formato de Outlook
    transformToOutlookFormat(payload: any): OutlookEvent {
        const {
            appointmentId,
            subject,
            location,
            startDateTime,
            endDateTime,
            timeZone,
            attendees,
            technicianEmail,
            userEmail,
            priority,
        } = payload;

        // Determinar asunto del evento
        const eventSubject = subject || this.generateEventSummary(appointmentId, priority);

        // Determinar cuerpo del evento
        const body = {
            contentType: 'html' as const,
            content: this.generateHtmlDescription(payload),
        };

        // Procesar asistentes para Outlook
        const eventAttendees = this.processOutlookAttendees(attendees, technicianEmail, userEmail);

        // Configurar recordatorios
        const reminderMinutesBeforeStart = this.getReminderMinutes(priority);

        return {
            subject: eventSubject,
            body,
            start: {
                dateTime: startDateTime,
                timeZone: timeZone || 'Eastern Standard Time',
            },
            end: {
                dateTime: endDateTime,
                timeZone: timeZone || 'Eastern Standard Time',
            },
            location: location ? {
                displayName: location,
            } : undefined,
            attendees: eventAttendees,
            isOnlineMeeting: payload.isOnlineMeeting || false,
            onlineMeetingProvider: payload.onlineMeetingProvider || 'teamsForBusiness',
            reminderMinutesBeforeStart,
            extensions: [
                {
                    id: `extension_${appointmentId}`,
                    extensionName: 'com.contoso.appointment',
                    appointmentId,
                    priority: priority || 'MEDIUM',
                    correlationId: payload.correlationId,
                },
            ],
        };
    }

    private generateEventSummary(appointmentId: string, priority?: string): string {
        const priorityLabel = priority ? `[${priority}] ` : '';
        return `${priorityLabel}Technical Support - Appointment ${appointmentId}`;
    }

    private generateHtmlDescription(payload: any): string {
        const lines: string[] = [];

        lines.push('<html><body>');
        lines.push('<h3>Technical Support Appointment</h3>');
        lines.push('<table border="1" cellpadding="5" cellspacing="0">');
        lines.push(`<tr><td><strong>Appointment ID:</strong></td><td>${payload.appointmentId}</td></tr>`);
        lines.push(`<tr><td><strong>Device Type:</strong></td><td>${payload.deviceType}</td></tr>`);
        lines.push(`<tr><td><strong>Issue Type:</strong></td><td>${payload.issueType}</td></tr>`);

        if (payload.cornerId) {
            lines.push(`<tr><td><strong>Location:</strong></td><td>Corner ${payload.cornerId}</td></tr>`);
        }

        if (payload.technicianName) {
            lines.push(`<tr><td><strong>Technician:</strong></td><td>${payload.technicianName}</td></tr>`);
        }

        lines.push('</table>');

        if (payload.description) {
            lines.push('<h4>Issue Description:</h4>');
            lines.push(`<p>${this.escapeHtml(payload.description)}</p>`);
        }

        if (payload.specialInstructions) {
            lines.push('<h4>Special Instructions:</h4>');
            lines.push(`<p>${this.escapeHtml(payload.specialInstructions)}</p>`);
        }

        lines.push('</body></html>');

        return lines.join('\n');
    }

    private processOutlookAttendees(
        attendees: any[],
        technicianEmail?: string,
        userEmail?: string
    ): OutlookEvent['attendees'] {
        const eventAttendees: OutlookEvent['attendees'] = [];

        // Agregar técnico
        if (technicianEmail) {
            eventAttendees.push({
                emailAddress: {
                    address: technicianEmail,
                    name: 'Assigned Technician',
                },
                type: 'required',
                status: {
                    response: 'accepted',
                    time: new Date().toISOString(),
                },
            });
        }

        // Agregar usuario
        if (userEmail) {
            eventAttendees.push({
                emailAddress: {
                    address: userEmail,
                    name: 'Customer',
                },
                type: 'required',
                status: {
                    response: 'accepted',
                    time: new Date().toISOString(),
                },
            });
        }

        // Agregar asistentes adicionales
        if (Array.isArray(attendees)) {
            attendees.forEach(attendee => {
                if (attendee.email && attendee.email !== technicianEmail && attendee.email !== userEmail) {
                    eventAttendees.push({
                        emailAddress: {
                            address: attendee.email,
                            name: attendee.name,
                        },
                        type: attendee.type || 'optional',
                        status: {
                            response: attendee.responseStatus || 'none',
                        },
                    });
                }
            });
        }

        return eventAttendees.length > 0 ? eventAttendees : undefined;
    }

    private getReminderMinutes(priority?: string): number {
        switch (priority?.toUpperCase()) {
            case 'CRITICAL':
                return 60; // 1 hora antes
            case 'HIGH':
                return 120; // 2 horas antes
            case 'MEDIUM':
                return 180; // 3 horas antes
            case 'LOW':
                return 360; // 6 horas antes
            default:
                return 180; // Default 3 horas
        }
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
