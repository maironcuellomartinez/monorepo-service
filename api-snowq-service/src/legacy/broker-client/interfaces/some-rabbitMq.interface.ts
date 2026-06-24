/**
 * Tipos de exchanges soportados por el broker
 */
export type ExchangeType = 'direct' | 'topic' | 'fanout' | 'headers';


/**
 * Declaración de un exchange
 */
export interface ExchangeDeclaration {
    /** Nombre del exchange */
    name: string;
    /** Tipo de exchange para enrutamiento */
    type: ExchangeType;
    /** Opciones de configuración */
    options?: {
        /** ¿Es exchange duradero? */
        durable?: boolean;
    };
}

/**
 * Declaración de una cola
 */
export interface QueueDeclaration {
    /** Nombre de la cola */
    name: string;
    /** Opciones de configuración */
    options?: {
        /** ¿Es cola duradera? */
        durable?: boolean;
        /** ¿Persiste mensajes en MySQL? */
        persistent?: boolean;
        /** Tamaño máximo de la cola */
        maxSize?: number;
        /** Política de desbordamiento */
        overflowPolicy?: 'drop-head' | 'drop-tail' | 'block';
        /** Nombre de la DLQ asociada */
        deadLetterQueue?: string;
        /** TTL por defecto (ms) */
        ttl?: number;
        /** Prefetch count para consumers */
        prefetch?: number;
        /** Máximo número de reintentos */
        maxRetries?: number;
    };
}

/**
 * Declaración de un binding
 */
export interface BindingDeclaration {
    /** Exchange de origen */
    exchange: string;
    /** Cola destino */
    queue: string;
    /** Routing key para enrutamiento (opcional) */
    routingKey?: string;
}


/**
 * Mensaje básico que viaja por el broker
 */
export interface Message {
    /** ID único del mensaje */
    messageId: string;
    /** Exchange donde se publicó */
    exchange: string;
    /** Routing key usada */
    routingKey: string;
    /** Cuerpo del mensaje */
    data: any;
    /** Headers adicionales */
    headers?: Record<string, any>;
    /** Timestamp en ms (opcional) */
    timestamp?: number;
    /** Tiempo de vida en ms (opcional) */
    ttl?: number;
    /** Prioridad (0-10, opcional) */
    priority?: number;
    /** Próximo reintento (timestamp) */
    nextRetryAt?: number;
    /** Intentos de reintento */
    redeliveryCount?: number;
    /** ¿Es persistente? */
    persistent?: boolean;
}

/**
 * Información de un consumer
 */
export interface ConsumerInfo {
    /** ID único del client */
    clientId: string;
    /** Cola que consume */
    queue: string;
    /** Última vez que se vio activo */
    lastSeen: Date;
    /** Mensajes pendientes de ack */
    pendingAcks: Map<string, Message>;
    /** Máximo número de reintentos */
    maxRetries: number;
    /** ¿Está activo? */
    isActive: boolean;
    /** Intentos de reconexión */
    reconnectAttempts: number;
    /** Timestamps de mensajes enviados (para rate limiting) */
    sentTimestamps: number[];
    /** Host del consumer (para push) */
    host?: string;
    /** Puerto del consumer */
    port?: number;
    /** ¿Es consumer push? */
    isPush?: boolean;
    /** Opciones del consumer */
    options?: Record<string, any>;
    /** Rate limit (msgs/s) */
    rateLimit?: number;
}

/**
 * Metadata de TTL para un mensaje
 */
export interface MessageTTL {
    /** ID del mensaje */
    messageId: string;
    /** Cola donde está */
    queue: string;
    /** Cuándo expira */
    expiresAt: Date;
    /** Cuándo se creó */
    createdAt: Date;
}


export interface BrokerStatusData {
    /** Lista de exchanges */
    exchanges: ExchangeDeclaration[];
    /** Lista de colas */
    queues: QueueDeclaration[];
    /** Lista de bindings */
    bindings: BindingDeclaration[];
    /** Lista de TTLs */
    messageTTLs: MessageTTL[];
    /** Lista de reintentos */
    messageRetry: number[];
    /** Lista de consumers */
    consumers: ConsumerInfo[];
}

/**
 * Respuesta del broker
 */
export interface BrokerResponse<T = unknown> {
    status: 'success' | 'error';
    message?: string;
    data?: T;
}

/**
 * Parametros para registrar un consumidor
 */
export interface RegisterPushConsumerParams {
    /** ID único del client */
    clientId: string;
    /** Cola que consume */
    queue: string;
    /** Host del consumer (para push) */
    host: string;
    /** Puerto del consumer */
    port: number;
    /** Opciones del consumer */
    options?: RegisterOptions;
}

/**
 * Opciones para registrar un consumidor
 */
export interface RegisterOptions {
    /** Prefetch */
    prefetch?: number;
    /** ¿Es durable? */
    durable?: boolean;
    /** ¿Verificar conexión? */
    verifyConnection?: boolean;
    /** Patrón */
    pattern?: string;
    /** Tema */
    topic?: string;
}
