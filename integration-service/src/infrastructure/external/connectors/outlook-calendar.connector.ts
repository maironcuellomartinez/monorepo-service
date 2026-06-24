// src/infrastructure/external/connectors/outlook-calendar.connector.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';
import { HealthCheckResult, IExternalConnector } from 'src/domain/interfaces/external-connector.interface';
import { CalendarAdapter } from '../adapters/calendar.adapter';

export interface OutlookEvent {
    id?: string;
    subject: string;
    body?: {
        contentType: 'text' | 'html';
        content: string;
    };
    start: {
        dateTime: string;
        timeZone: string;
    };
    end: {
        dateTime: string;
        timeZone: string;
    };
    location?: {
        displayName: string;
    };
    attendees?: Array<{
        emailAddress: {
            address: string;
            name?: string;
        };
        type: 'required' | 'optional' | 'resource';
        status?: {
            response: 'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded';
            time?: string;
        };
    }>;
    isOnlineMeeting?: boolean;
    onlineMeetingProvider?: 'teamsForBusiness' | 'skypeForBusiness' | 'skypeForConsumer';
    reminderMinutesBeforeStart?: number;
    extensions?: Array<{
        id: string;
        extensionName: string;
        [key: string]: any;
    }>;
}

@Injectable()
export class OutlookCalendarConnector implements Partial<IExternalConnector> {
    private readonly logger = new Logger(OutlookCalendarConnector.name);
    private graphClient: Client;
    private readonly userId: string;
    private readonly timeout: number;

    constructor(
        private readonly configService: ConfigService,
        private readonly adapter: CalendarAdapter,
    ) {
        this.userId = this.configService.get<string>('outlook.userId', 'me');
        this.timeout = this.configService.get<number>('outlook.timeout', 10000);

        this.initializeGraphClient();
    }

    private initializeGraphClient(): void {
        try {
            const tenantId = this.configService.get<string>('outlook.tenantId');
            const clientId = this.configService.get<string>('outlook.clientId');
            const clientSecret = this.configService.get<string>('outlook.clientSecret');

            if (!tenantId || !clientId || !clientSecret) {
                this.logger.warn('Outlook Calendar configuration incomplete');
                return;
            }

            const credential = new ClientSecretCredential(
                tenantId,
                clientId,
                clientSecret
            );

            const authProvider = new TokenCredentialAuthenticationProvider(credential, {
                scopes: ['https://graph.microsoft.com/.default'],
            });

            this.graphClient = Client.initWithMiddleware({
                authProvider,
                defaultVersion: 'v1.0',
            });

            this.logger.log('Outlook Calendar client initialized');

        } catch (error) {
            this.logger.error('Failed to initialize Outlook Calendar client', {
                error: error.message,
            });
        }
    }

    async createEvent(payload: any): Promise<OutlookEvent> {
        const startTime = Date.now();

        try {
            this.logger.debug('Creating Outlook Calendar event', {
                subject: payload.subject,
                startTime: payload.start?.dateTime,
            });

            // Transformar datos al formato de Outlook
            const outlookEvent = this.adapter.transformToOutlookFormat(payload);

            // Validar evento
            this.validateOutlookEvent(outlookEvent);

            // Crear evento en Outlook
            const response = await this.graphClient
                .api(`/users/${this.userId}/calendar/events`)
                .post(outlookEvent);

            const duration = Date.now() - startTime;

            this.logger.log('Outlook Calendar event created successfully', {
                eventId: response.id,
                webLink: response.webLink,
                appointmentId: payload.appointmentId,
                duration,
            });

            return this.mapGraphEventToOutlookEvent(response);

        } catch (error) {
            this.logger.error('Failed to create Outlook Calendar event', {
                error: this.extractErrorMessage(error),
                payload,
                duration: Date.now() - startTime,
            });

            const classifiedError = this.classifyOutlookError(error);
            throw classifiedError;
        }
    }

    async updateEvent(eventId: string, updates: any): Promise<OutlookEvent> {
        const startTime = Date.now();

        try {
            this.logger.debug('Updating Outlook Calendar event', { eventId });

            // Transformar actualizaciones
            const outlookUpdates = this.adapter.transformToOutlookFormat(updates);

            // Actualizar evento
            const response = await this.graphClient
                .api(`/users/${this.userId}/calendar/events/${eventId}`)
                .patch(outlookUpdates);

            const duration = Date.now() - startTime;

            this.logger.log('Outlook Calendar event updated successfully', {
                eventId,
                duration,
            });

            return this.mapGraphEventToOutlookEvent(response);

        } catch (error) {
            this.logger.error('Failed to update Outlook Calendar event', {
                eventId,
                error: this.extractErrorMessage(error),
                duration: Date.now() - startTime,
            });

            throw new Error(`Failed to update Outlook event: ${this.extractErrorMessage(error)}`);
        }
    }

    async deleteEvent(eventId: string): Promise<void> {
        const startTime = Date.now();

        try {
            this.logger.debug('Deleting Outlook Calendar event', { eventId });

            await this.graphClient
                .api(`/users/${this.userId}/calendar/events/${eventId}`)
                .delete();

            const duration = Date.now() - startTime;

            this.logger.log('Outlook Calendar event deleted successfully', {
                eventId,
                duration,
            });

        } catch (error) {
            this.logger.error('Failed to delete Outlook Calendar event', {
                eventId,
                error: this.extractErrorMessage(error),
                duration: Date.now() - startTime,
            });

            // Si el evento ya no existe, no es un error crítico
            if (this.isEventNotFound(error)) {
                this.logger.warn('Outlook Calendar event already deleted or not found', { eventId });
                return;
            }

            throw new Error(`Failed to delete Outlook event: ${this.extractErrorMessage(error)}`);
        }
    }

    async getEvent(eventId: string): Promise<OutlookEvent> {
        try {
            const response = await this.graphClient
                .api(`/users/${this.userId}/calendar/events/${eventId}`)
                .get();

            return this.mapGraphEventToOutlookEvent(response);

        } catch (error) {
            this.logger.error('Failed to get Outlook Calendar event', {
                eventId,
                error: this.extractErrorMessage(error),
            });

            throw new Error(`Failed to get Outlook event: ${this.extractErrorMessage(error)}`);
        }
    }

    async listEvents(
        startDateTime: string,
        endDateTime: string,
        maxResults: number = 100
    ): Promise<OutlookEvent[]> {
        try {
            const response = await this.graphClient
                .api(`/users/${this.userId}/calendar/calendarView`)
                .query({
                    startDateTime,
                    endDateTime,
                    $top: maxResults,
                    $orderby: 'start/dateTime',
                })
                .get();

            return response.value?.map((event: any) =>
                this.mapGraphEventToOutlookEvent(event)
            ) || [];

        } catch (error) {
            this.logger.error('Failed to list Outlook Calendar events', {
                startDateTime,
                endDateTime,
                error: this.extractErrorMessage(error),
            });

            throw new Error(`Failed to list Outlook events: ${this.extractErrorMessage(error)}`);
        }
    }

    async createOnlineMeeting(eventId: string): Promise<{ joinUrl: string; meetingId: string }> {
        try {
            this.logger.debug('Creating online meeting for Outlook event', { eventId });

            const response = await this.graphClient
                .api(`/users/${this.userId}/calendar/events/${eventId}/onlineMeeting`)
                .post({
                    startDateTime: new Date().toISOString(),
                    endDateTime: new Date(Date.now() + 3600000).toISOString(),
                    subject: 'Online Meeting',
                });

            this.logger.log('Online meeting created', {
                eventId,
                meetingId: response.id,
            });

            return {
                joinUrl: response.joinUrl,
                meetingId: response.id,
            };

        } catch (error) {
            this.logger.error('Failed to create online meeting', {
                eventId,
                error: this.extractErrorMessage(error),
            });

            throw new Error(`Failed to create online meeting: ${this.extractErrorMessage(error)}`);
        }
    }

    // Métodos privados de utilidad
    private validateOutlookEvent(event: OutlookEvent): void {
        const errors: string[] = [];

        if (!event.subject || event.subject.trim().length === 0) {
            errors.push('subject is required');
        }

        if (!event.start?.dateTime) {
            errors.push('start.dateTime is required');
        }

        if (!event.end?.dateTime) {
            errors.push('end.dateTime is required');
        }

        // Validar que la fecha de fin sea después de la de inicio
        if (event.start.dateTime && event.end.dateTime) {
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);

            if (end <= start) {
                errors.push('end date must be after start date');
            }
        }

        if (errors.length > 0) {
            throw new Error(`Invalid Outlook event: ${errors.join(', ')}`);
        }
    }

    private mapGraphEventToOutlookEvent(graphEvent: any): OutlookEvent {
        return {
            id: graphEvent.id,
            subject: graphEvent.subject || '',
            body: graphEvent.body,
            start: {
                dateTime: graphEvent.start?.dateTime || '',
                timeZone: graphEvent.start?.timeZone || 'UTC',
            },
            end: {
                dateTime: graphEvent.end?.dateTime || '',
                timeZone: graphEvent.end?.timeZone || 'UTC',
            },
            location: graphEvent.location,
            attendees: graphEvent.attendees?.map((attendee: any) => ({
                emailAddress: {
                    address: attendee.emailAddress?.address || '',
                    name: attendee.emailAddress?.name,
                },
                type: attendee.type || 'required',
                status: attendee.status,
            })),
            isOnlineMeeting: graphEvent.isOnlineMeeting,
            onlineMeetingProvider: graphEvent.onlineMeetingProvider,
            reminderMinutesBeforeStart: graphEvent.reminderMinutesBeforeStart,
            extensions: graphEvent.extensions,
        };
    }

    private extractErrorMessage(error: any): string {
        if (error?.statusCode === 429) {
            return 'Rate limit exceeded, please try again later';
        }

        if (error?.response?.body?.error?.message) {
            return error.response.body.error.message;
        }

        if (error?.message) {
            return error.message;
        }

        return 'Unknown error';
    }

    private classifyOutlookError(error: any): Error {
        const errorMessage = this.extractErrorMessage(error).toLowerCase();

        // Errores de autenticación/autorización
        if (errorMessage.includes('authenticate') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('forbidden')) {
            return new Error(`Outlook Calendar authentication error: ${errorMessage}`);
        }

        // Errores de cuota/rate limit
        if (errorMessage.includes('quota') ||
            errorMessage.includes('rate limit') ||
            errorMessage.includes('throttled')) {
            return new Error(`Outlook Calendar quota exceeded: ${errorMessage}`);
        }

        // Errores de validación
        if (errorMessage.includes('invalid') ||
            errorMessage.includes('bad request') ||
            errorMessage.includes('validation')) {
            return new Error(`Outlook Calendar validation error: ${errorMessage}`);
        }

        // Errores de servicio no disponible
        if (errorMessage.includes('service unavailable') ||
            errorMessage.includes('503')) {
            return new Error(`Outlook Calendar service unavailable: ${errorMessage}`);
        }

        // Error genérico
        return new Error(`Outlook Calendar error: ${errorMessage}`);
    }

    private isEventNotFound(error: any): boolean {
        const errorMessage = this.extractErrorMessage(error).toLowerCase();
        return errorMessage.includes('not found') ||
            errorMessage.includes('does not exist') ||
            errorMessage.includes('404');
    }

    // Método para health check
    async healthCheck(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            await this.graphClient
                .api('/me')
                .select('displayName,userPrincipalName')
                .get();

            const latency = Date.now() - startTime;

            return {
                status: 'HEALTHY',
                latency,
                timestamp: new Date().toISOString(),
            };

        } catch (error) {
            this.logger.warn('Outlook Calendar health check failed', {
                error: this.extractErrorMessage(error),
            });

            return {
                status: 'UNHEALTHY',
                latency: Date.now() - startTime,
                timestamp: new Date().toISOString(),
            };
        }
    }
}