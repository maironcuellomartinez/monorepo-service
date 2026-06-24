// src/domain/interfaces/external-connector.interface.ts

/**
 * Interfaz base para todos los conectores de sistemas externos
 * Define el contrato que deben implementar todos los conectores
 */
export interface IExternalConnector {
    /**
     * Identificador único del sistema externo
     */
    readonly systemId: string;

    /**
     * Nombre del sistema externo (para logging y display)
     */
    readonly systemName: string;

    /**
     * Versión de la API del conector
     */
    readonly apiVersion: string;

    /**
     * Verifica si el sistema externo está disponible
     * @returns Promesa que resuelve a true si el sistema está disponible
     */
    isAvailable(): Promise<boolean>;

    /**
     * Realiza un health check del sistema externo
     * @returns Promesa con el estado de salud del sistema
     */
    healthCheck(): Promise<HealthCheckResult>;

    /**
     * Ejecuta una operación en el sistema externo
     * @param operation Nombre de la operación a ejecutar
     * @param payload Datos necesarios para la operación
     * @returns Promesa con el resultado de la operación
     */
    execute(operation: string, payload: any): Promise<any>;

    /**
     * Obtiene métricas del sistema externo
     * @returns Promesa con métricas del sistema
     */
    getMetrics(): Promise<SystemMetrics>;

    /**
     * Valida los datos antes de enviarlos al sistema externo
     * @param operation Operación a validar
     * @param payload Datos a validar
     * @returns Resultado de la validación
     */
    validate(operation: string, payload: any): ValidationResult;

    /**
     * Transforma los datos al formato del sistema externo
     * @param operation Operación a transformar
     * @param payload Datos a transformar
     * @returns Datos transformados
     */
    transformToExternalFormat(operation: string, payload: any): any;

    /**
     * Transforma los datos del formato del sistema externo
     * @param operation Operación realizada
     * @param externalData Datos del sistema externo
     * @returns Datos transformados
     */
    transformFromExternalFormat(operation: string, externalData: any): any;

    /**
     * Maneja errores específicos del sistema externo
     * @param error Error ocurrido
     * @param context Contexto de la operación
     * @returns Error clasificado
     */
    handleError(error: any, context: OperationContext): ConnectorError;

    /**
     * Obtiene la configuración del conector
     */
    getConfig(): ConnectorConfig;

    /**
     * Actualiza la configuración del conector
     * @param config Nueva configuración
     */
    updateConfig(config: Partial<ConnectorConfig>): void;

    /**
     * Reinicia el conector (útil después de cambios de configuración)
     */
    reset(): Promise<void>;

    /**
     * Cierra conexiones y libera recursos
     */
    disconnect(): Promise<void>;
}

// ========== TIPOS Y INTERFACES RELACIONADAS ==========

/**
 * Resultado del health check del sistema
 */
export interface HealthCheckResult {
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    latency: number;
    timestamp: string;
    details?: {
        [key: string]: any;
    };
    errors?: string[];
}

/**
 * Métricas del sistema externo
 */
export interface SystemMetrics {
    uptime: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    lastRequestTime?: string;
    errorRate: number;
    byOperation: {
        [operation: string]: {
            total: number;
            success: number;
            failure: number;
            averageTime: number;
        };
    };
}

/**
 * Resultado de validación
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

export interface ValidationWarning {
    field: string;
    message: string;
    code: string;
}

/**
 * Contexto de operación para manejo de errores
 */
export interface OperationContext {
    operation: string;
    payload: any;
    correlationId: string;
    attempt: number;
    timestamp: string;
}

/**
 * Error específico del conector
 */
export class ConnectorError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly system: string,
        public readonly operation: string,
        public readonly originalError?: any,
        public readonly retryable: boolean = true,
        public readonly classification: ErrorClassification = 'UNKNOWN'
    ) {
        super(message);
        this.name = 'ConnectorError';
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            system: this.system,
            operation: this.operation,
            retryable: this.retryable,
            classification: this.classification,
            stack: this.stack,
            originalError: this.originalError,
        };
    }
}

/**
 * Clasificación de errores
 */
export type ErrorClassification =
    | 'AUTHENTICATION'
    | 'AUTHORIZATION'
    | 'VALIDATION'
    | 'NETWORK'
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'QUOTA_EXCEEDED'
    | 'SERVICE_UNAVAILABLE'
    | 'DATA_NOT_FOUND'
    | 'CONFLICT'
    | 'UNKNOWN';

/**
 * Configuración del conector
 */
export interface ConnectorConfig {
    baseUrl: string;
    timeout: number;
    retryPolicy: RetryPolicy;
    circuitBreaker: CircuitBreakerConfig;
    authentication: AuthenticationConfig;
    headers?: Record<string, string>;
    enableCompression?: boolean;
    enableCaching?: boolean;
    cacheTtl?: number;
    logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export interface RetryPolicy {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    multiplier: number;
    jitter: boolean;
    retryableStatusCodes: number[];
    retryableErrors: string[];
}

export interface CircuitBreakerConfig {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    resetTimeout: number;
    halfOpenMaxCalls: number;
}

export interface AuthenticationConfig {
    type: 'NONE' | 'API_KEY' | 'BASIC' | 'BEARER' | 'OAUTH2';
    credentials?: {
        apiKey?: string;
        username?: string;
        password?: string;
        token?: string;
        clientId?: string;
        clientSecret?: string;
        refreshToken?: string;
        tokenUrl?: string;
    };
    tokenTtl?: number;
    autoRefresh?: boolean;
}

// ========== INTERFACES ESPECÍFICAS POR TIPO DE CONECTOR ==========

/**
 * Interfaz para conectores que soportan operaciones CRUD
 */
export interface ICrudConnector extends IExternalConnector {
    create(resource: string, data: any): Promise<any>;
    read(resource: string, id: string): Promise<any>;
    update(resource: string, id: string, data: any): Promise<any>;
    delete(resource: string, id: string): Promise<void>;
    list(resource: string, filters?: any): Promise<any[]>;
}

/**
 * Interfaz para conectores de sistemas de ticketing
 */
export interface ITicketingConnector extends IExternalConnector {
    createTicket(ticketData: any): Promise<any>;
    updateTicket(ticketId: string, updates: any): Promise<any>;
    getTicket(ticketId: string): Promise<any>;
    addComment(ticketId: string, comment: string): Promise<void>;
    changeStatus(ticketId: string, status: string): Promise<void>;
    assignTicket(ticketId: string, assignee: string): Promise<void>;
    searchTickets(filters: any): Promise<any[]>;
}

/**
 * Interfaz para conectores de sistemas de calendario
 */
export interface ICalendarConnector extends IExternalConnector {
    createEvent(eventData: any): Promise<any>;
    updateEvent(eventId: string, updates: any): Promise<any>;
    deleteEvent(eventId: string): Promise<void>;
    getEvent(eventId: string): Promise<any>;
    listEvents(startDate: string, endDate: string): Promise<any[]>;
    createQuickEvent(text: string): Promise<any>;
    getFreeBusy(startDate: string, endDate: string, attendees: string[]): Promise<any>;
}

/**
 * Interfaz para conectores de sistemas de mensajería/notificaciones
 */
export interface INotificationConnector extends IExternalConnector {
    sendEmail(emailData: any): Promise<any>;
    sendSMS(smsData: any): Promise<any>;
    sendPushNotification(pushData: any): Promise<any>;
    sendWebhook(webhookData: any): Promise<any>;
    getDeliveryStatus(messageId: string): Promise<any>;
}

/**
 * Interfaz para conectores de sistemas de inventario/almacén
 */
export interface IInventoryConnector extends IExternalConnector {
    reserveItem(itemId: string, quantity: number): Promise<any>;
    releaseItem(itemId: string, quantity: number): Promise<void>;
    checkAvailability(itemId: string): Promise<number>;
    createItem(itemData: any): Promise<any>;
    updateStock(itemId: string, adjustment: number): Promise<any>;
    listItems(filters?: any): Promise<any[]>;
}

/**
 * Interfaz para conectores de sistemas de pagos
 */
export interface IPaymentConnector extends IExternalConnector {
    processPayment(paymentData: any): Promise<any>;
    refundPayment(transactionId: string, amount?: number): Promise<any>;
    getPaymentStatus(transactionId: string): Promise<any>;
    capturePayment(transactionId: string, amount?: number): Promise<any>;
    voidPayment(transactionId: string): Promise<any>;
    createCustomer(customerData: any): Promise<any>;
}

// ========== IMPLEMENTACIÓN BASE ABSTRACT ==========

/**
 * Implementación base abstracta para conectores
 * Proporciona funcionalidad común a todos los conectores
 */
export abstract class BaseExternalConnector implements IExternalConnector {
    abstract readonly systemId: string;
    abstract readonly systemName: string;
    abstract readonly apiVersion: string;

    protected config: ConnectorConfig;
    protected metrics: SystemMetrics;
    protected lastHealthCheck?: HealthCheckResult;
    protected isConnected: boolean = false;

    constructor(config: ConnectorConfig) {
        this.config = config;
        this.metrics = this.initializeMetrics();
    }

    // Métodos abstractos que deben ser implementados
    abstract execute(operation: string, payload: any): Promise<any>;
    abstract transformToExternalFormat(operation: string, payload: any): any;
    abstract transformFromExternalFormat(operation: string, externalData: any): any;
    abstract handleError(error: any, context: OperationContext): ConnectorError;

    // Implementaciones comunes
    async isAvailable(): Promise<boolean> {
        try {
            const health = await this.healthCheck();
            return health.status === 'HEALTHY' || health.status === 'DEGRADED';
        } catch {
            return false;
        }
    }

    async healthCheck(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            // Implementación básica de health check
            // Los conectores específicos pueden sobreescribir este método
            const result: HealthCheckResult = {
                status: 'HEALTHY',
                latency: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                details: {
                    systemId: this.systemId,
                    config: {
                        baseUrl: this.config.baseUrl,
                        timeout: this.config.timeout,
                    },
                },
            };

            this.lastHealthCheck = result;
            return result;

        } catch (error) {
            const result: HealthCheckResult = {
                status: 'UNHEALTHY',
                latency: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                errors: [error.message],
            };

            this.lastHealthCheck = result;
            return result;
        }
    }

    getMetrics(): Promise<SystemMetrics> {
        // Calcular métricas en tiempo real
        const now = Date.now();
        const totalRequests = this.metrics.totalRequests;
        const failedRequests = this.metrics.failedRequests;

        const updatedMetrics: SystemMetrics = {
            ...this.metrics,
            errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
        };

        return Promise.resolve(updatedMetrics);
    }

    validate(operation: string, payload: any): ValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Validación básica que todos los conectores pueden usar
        if (!payload) {
            errors.push({
                field: 'payload',
                message: 'Payload is required',
                code: 'VALIDATION_REQUIRED',
            });
        }

        if (typeof payload !== 'object') {
            errors.push({
                field: 'payload',
                message: 'Payload must be an object',
                code: 'VALIDATION_TYPE',
            });
        }

        // Los conectores específicos pueden agregar validaciones adicionales
        const additionalValidation = this.performAdditionalValidation(operation, payload);
        errors.push(...additionalValidation.errors);
        warnings.push(...additionalValidation.warnings);

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    protected performAdditionalValidation(
        operation: string,
        payload: any
    ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
        // Método hook para validaciones adicionales
        return { errors: [], warnings: [] };
    }

    getConfig(): ConnectorConfig {
        return { ...this.config };
    }

    updateConfig(config: Partial<ConnectorConfig>): void {
        this.config = {
            ...this.config,
            ...config,
        };

        this.log('info', 'Configuration updated', { changes: Object.keys(config) });
    }

    async reset(): Promise<void> {
        this.log('info', 'Resetting connector');

        await this.disconnect();
        this.metrics = this.initializeMetrics();
        this.isConnected = false;

        this.log('info', 'Connector reset completed');
    }

    async disconnect(): Promise<void> {
        if (this.isConnected) {
            this.log('info', 'Disconnecting connector');
            this.isConnected = false;
        }
    }

    // Métodos de utilidad protegidos
    log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            system: this.systemId,
            level,
            message,
            data,
        };

        // En una implementación real, usarías un logger configurado
        console.log(JSON.stringify(logEntry));
    }

    recordMetric(operation: string, success: boolean, duration: number): void {
        this.metrics.totalRequests++;

        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }

        // Actualizar tiempo promedio de respuesta
        const currentAvg = this.metrics.averageResponseTime;
        const totalCalls = this.metrics.successfulRequests + this.metrics.failedRequests;
        this.metrics.averageResponseTime =
            (currentAvg * (totalCalls - 1) + duration) / totalCalls;

        // Actualizar métricas por operación
        if (!this.metrics.byOperation[operation]) {
            this.metrics.byOperation[operation] = {
                total: 0,
                success: 0,
                failure: 0,
                averageTime: 0,
            };
        }

        const opMetrics = this.metrics.byOperation[operation];
        opMetrics.total++;

        if (success) {
            opMetrics.success++;
        } else {
            opMetrics.failure++;
        }

        opMetrics.averageTime =
            (opMetrics.averageTime * (opMetrics.total - 1) + duration) / opMetrics.total;

        this.metrics.lastRequestTime = new Date().toISOString();
    }

    protected initializeMetrics(): SystemMetrics {
        return {
            uptime: Date.now(),
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            errorRate: 0,
            byOperation: {},
        };
    }

    protected createConnectorError(
        message: string,
        code: string,
        operation: string,
        originalError?: any,
        retryable: boolean = true,
        classification: ErrorClassification = 'UNKNOWN'
    ): ConnectorError {
        return new ConnectorError(
            message,
            code,
            this.systemId,
            operation,
            originalError,
            retryable,
            classification
        );
    }

    protected isRetryableError(error: any): boolean {
        if (!this.config.retryPolicy.retryableErrors) {
            return false;
        }

        // Verificar códigos de estado HTTP retryables
        if (error.response?.status) {
            const status = error.response.status;
            if (this.config.retryPolicy.retryableStatusCodes.includes(status)) {
                return true;
            }
        }

        // Verificar mensajes de error retryables
        const errorMessage = error.message?.toLowerCase() || '';
        for (const retryableError of this.config.retryPolicy.retryableErrors) {
            if (errorMessage.includes(retryableError.toLowerCase())) {
                return true;
            }
        }

        // Errores de network/timeout son retryables por defecto
        if (errorMessage.includes('network') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('econnreset') ||
            errorMessage.includes('econnrefused')) {
            return true;
        }

        return false;
    }

    protected calculateRetryDelay(attempt: number): number {
        const { initialDelay, maxDelay, multiplier, jitter } = this.config.retryPolicy;

        let delay = initialDelay * Math.pow(multiplier, attempt - 1);
        delay = Math.min(delay, maxDelay);

        if (jitter) {
            const jitterAmount = delay * 0.1; // 10% de jitter
            delay += (Math.random() * jitterAmount * 2) - jitterAmount;
        }

        return Math.max(delay, initialDelay);
    }
}

// ========== DECORATOR PARA METRICS Y LOGGING ==========

/**
 * Decorator para agregar logging y métricas automáticamente a los métodos del conector
 */
export function withMetricsAndLogging(
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
        const connector = this as BaseExternalConnector;
        const operation = propertyName;
        const correlationId = this.generateCorrelationId?.() || 'N/A';
        const startTime = Date.now();

        try {
            connector.log('debug', `Starting operation: ${operation}`, {
                correlationId,
                args: this.sanitizeArgs?.(args) || args,
            });

            const result = await originalMethod.apply(this, args);
            const duration = Date.now() - startTime;

            connector.recordMetric(operation, true, duration);

            connector.log('info', `Operation completed: ${operation}`, {
                correlationId,
                duration,
                success: true,
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            connector.recordMetric(operation, false, duration);

            const connectorError = connector.handleError?.(error, {
                operation,
                payload: args[0],
                correlationId,
                attempt: 1,
                timestamp: new Date().toISOString(),
            }) || error;

            connector.log('error', `Operation failed: ${operation}`, {
                correlationId,
                duration,
                error: connectorError.message,
                retryable: connectorError.retryable,
                classification: connectorError.classification,
            });

            throw connectorError;
        }
    };

    return descriptor;
}

// ========== FACTORY PARA CREAR CONECTORES ==========

/**
 * Factory para crear instancias de conectores
 */
export class ConnectorFactory {
    private static connectors = new Map<string, new (config: ConnectorConfig) => IExternalConnector>();

    static registerConnector(
        systemId: string,
        connectorClass: new (config: ConnectorConfig) => IExternalConnector
    ): void {
        this.connectors.set(systemId, connectorClass);
    }

    static createConnector(
        systemId: string,
        config: ConnectorConfig
    ): IExternalConnector {
        const ConnectorClass = this.connectors.get(systemId);

        if (!ConnectorClass) {
            throw new Error(`No connector registered for system: ${systemId}`);
        }

        return new ConnectorClass(config);
    }

    static getAvailableConnectors(): string[] {
        return Array.from(this.connectors.keys());
    }
}