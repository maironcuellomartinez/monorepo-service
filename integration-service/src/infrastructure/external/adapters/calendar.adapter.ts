// src/infrastructure/external/adapters/calendar.adapter.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutlookEvent } from '../connectors/outlook-calendar.connector';

// Local CalendarEvent type (previously from google-calendar.connector, which was removed)
export interface CalendarEvent {
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
    reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> };
    extendedProperties?: { private?: Record<string, any> };
}

@Injectable()
export class CalendarAdapter {
    constructor(private readonly configService: ConfigService) { }

    // Transformar a formato de Google Calendar
    transformToGoogleCalendarFormat(payload: any): CalendarEvent {
        const {
            appointmentId,
            subject,
            description,
            location,
            startDateTime,
            endDateTime,
            timeZone,
            attendees,
            technicianEmail,
            userEmail,
            priority,
        } = payload;

        // Determinar resumen del evento
        const summary = subject || this.generateEventSummary(appointmentId, priority);

        // Determinar descripción
        const eventDescription = description || this.generateEventDescription(payload);

        // Determinar ubicación
        const eventLocation = location || this.generateEventLocation(payload);

        // Procesar asistentes
        const eventAttendees = this.processAttendees(attendees, technicianEmail, userEmail);

        // Configurar recordatorios
        const reminders = this.configureReminders(priority);

        return {
            summary,
            description: eventDescription,
            location: eventLocation,
            start: {
                dateTime: startDateTime,
                timeZone: timeZone || 'America/New_York',
            },
            end: {
                dateTime: endDateTime,
                timeZone: timeZone || 'America/New_York',
            },
            attendees: eventAttendees,
            reminders,
            extendedProperties: {
                private: {
                    appointmentId,
                    priority: priority || 'MEDIUM',
                    correlationId: payload.correlationId,
                },
            },
        };
    }

    // Transformar a formato de Outlook
    transformToOutlookFormat(payload: any): OutlookEvent {
        const {
            appointmentId,
            subject,
            description,
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

    // Transformar desde formato de Google Calendar
    transformFromGoogleCalendarFormat(calendarEvent: CalendarEvent): any {
        return {
            eventId: calendarEvent.id,
            summary: calendarEvent.summary,
            description: calendarEvent.description,
            location: calendarEvent.location,
            startDateTime: calendarEvent.start.dateTime,
            endDateTime: calendarEvent.end.dateTime,
            timeZone: calendarEvent.start.timeZone,
            attendees: calendarEvent.attendees?.map(attendee => ({
                email: attendee.email,
                displayName: attendee.displayName,
                responseStatus: attendee.responseStatus,
            })),
            appointmentId: calendarEvent.extendedProperties?.private?.appointmentId,
            priority: calendarEvent.extendedProperties?.private?.priority,
            correlationId: calendarEvent.extendedProperties?.private?.correlationId,
        };
    }

    // Transformar desde formato de Outlook
    transformFromOutlookFormat(outlookEvent: OutlookEvent): any {
        return {
            eventId: outlookEvent.id,
            subject: outlookEvent.subject,
            description: outlookEvent.body?.content,
            location: outlookEvent.location?.displayName,
            startDateTime: outlookEvent.start.dateTime,
            endDateTime: outlookEvent.end.dateTime,
            timeZone: outlookEvent.start.timeZone,
            attendees: outlookEvent.attendees?.map(attendee => ({
                email: attendee.emailAddress.address,
                name: attendee.emailAddress.name,
                type: attendee.type,
                responseStatus: attendee.status?.response,
            })),
            isOnlineMeeting: outlookEvent.isOnlineMeeting,
            onlineMeetingProvider: outlookEvent.onlineMeetingProvider,
            appointmentId: outlookEvent.extensions?.[0]?.appointmentId,
            priority: outlookEvent.extensions?.[0]?.priority,
            correlationId: outlookEvent.extensions?.[0]?.correlationId,
        };
    }

    private generateEventSummary(appointmentId: string, priority?: string): string {
        const priorityLabel = priority ? `[${priority}] ` : '';
        return `${priorityLabel}Technical Support - Appointment ${appointmentId}`;
    }

    private generateEventDescription(payload: any): string {
        const lines: string[] = [];

        lines.push(`Appointment ID: ${payload.appointmentId}`);
        lines.push(`Device Type: ${payload.deviceType}`);
        lines.push(`Issue Type: ${payload.issueType}`);

        if (payload.description) {
            lines.push('');
            lines.push('Issue Description:');
            lines.push(payload.description);
        }

        if (payload.cornerId) {
            lines.push(`Location: Corner ${payload.cornerId}`);
        }

        if (payload.technicianName) {
            lines.push(`Assigned Technician: ${payload.technicianName}`);
        }

        if (payload.specialInstructions) {
            lines.push('');
            lines.push('Special Instructions:');
            lines.push(payload.specialInstructions);
        }

        return lines.join('\n');
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

    private generateEventLocation(payload: any): string {
        if (payload.cornerAddress) {
            return payload.cornerAddress;
        }

        if (payload.cornerId) {
            return `Corner ${payload.cornerId}`;
        }

        return 'Technical Support Center';
    }

    private processAttendees(
        attendees: any[],
        technicianEmail?: string,
        userEmail?: string
    ): CalendarEvent['attendees'] {
        const eventAttendees: CalendarEvent['attendees'] = [];

        // Agregar técnico si tiene email
        if (technicianEmail) {
            eventAttendees.push({
                email: technicianEmail,
                displayName: 'Assigned Technician',
                responseStatus: 'accepted',
            });
        }

        // Agregar usuario si tiene email
        if (userEmail) {
            eventAttendees.push({
                email: userEmail,
                displayName: 'Customer',
                responseStatus: 'accepted',
            });
        }

        // Agregar asistentes adicionales
        if (Array.isArray(attendees)) {
            attendees.forEach(attendee => {
                if (attendee.email && attendee.email !== technicianEmail && attendee.email !== userEmail) {
                    eventAttendees.push({
                        email: attendee.email,
                        displayName: attendee.name,
                        responseStatus: attendee.responseStatus || 'needsAction',
                    });
                }
            });
        }

        return eventAttendees.length > 0 ? eventAttendees : undefined;
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

    private configureReminders(priority?: string): CalendarEvent['reminders'] {
        const reminderMinutes = this.getReminderMinutes(priority);

        return {
            useDefault: false,
            overrides: [
                {
                    method: 'email',
                    minutes: reminderMinutes,
                },
                {
                    method: 'popup',
                    minutes: 15, // Recordatorio popup 15 minutos antes
                },
            ],
        };
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

    // Método para generar color del evento basado en prioridad
    getEventColor(priority?: string): string {
        const colorMap: Record<string, string> = {
            'CRITICAL': '11', // Rojo
            'HIGH': '6',      // Naranja
            'MEDIUM': '5',    // Amarillo
            'LOW': '2',       // Verde
        };

        if (!priority) {
            return '5';
        }
        return colorMap[priority.toUpperCase()] || '5'; // Amarillo por defecto
    }

    // Método para validar datos del evento
    validateCalendarEvent(payload: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!payload.startDateTime) {
            errors.push('startDateTime is required');
        }

        if (!payload.endDateTime) {
            errors.push('endDateTime is required');
        }

        // Validar fechas
        if (payload.startDateTime && payload.endDateTime) {
            const start = new Date(payload.startDateTime);
            const end = new Date(payload.endDateTime);

            if (end <= start) {
                errors.push('endDateTime must be after startDateTime');
            }

            // No permitir eventos en el pasado
            if (start < new Date()) {
                errors.push('startDateTime cannot be in the past');
            }
        }

        // Validar timezone
        if (payload.timeZone && !this.isValidTimeZone(payload.timeZone)) {
            errors.push('Invalid timeZone');
        }

        // Validar emails de asistentes
        if (payload.attendees) {
            const invalidEmails = payload.attendees
                .filter((attendee: any) => attendee.email && !this.isValidEmail(attendee.email))
                .map((attendee: any) => attendee.email);

            if (invalidEmails.length > 0) {
                errors.push(`Invalid email addresses: ${invalidEmails.join(', ')}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    private isValidTimeZone(timeZone: string): boolean {
        try {
            Intl.DateTimeFormat(undefined, { timeZone });
            return true;
        } catch {
            return false;
        }
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Método para calcular fecha de finalización basada en duración
    calculateEndDateTime(startDateTime: string, durationMinutes: number): string {
        const start = new Date(startDateTime);
        const end = new Date(start.getTime() + (durationMinutes * 60 * 1000));
        return end.toISOString();
    }

    // Método para formatear fecha para display
    formatDateTimeForDisplay(dateTime: string, timeZone: string): string {
        const date = new Date(dateTime);
        return date.toLocaleString('en-US', {
            timeZone,
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
}