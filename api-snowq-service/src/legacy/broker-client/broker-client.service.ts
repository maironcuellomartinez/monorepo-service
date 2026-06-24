import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import CircuitBreaker from 'opossum';
import { PublishMessageDto } from './dto/client-broker.dto';
import { BindingDeclaration, ExchangeDeclaration, QueueDeclaration } from './interfaces';

export interface BrokerResponse<T = any> {
    status: 'success' | 'error';
    data?: T;
    message?: string;
}

/** Códigos de error de red que indican pérdida real de conexión */
const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH']);

/** Tiempo máximo que un caller espera por reconexión antes de fallar rápido (ms) */
const CALLER_WAIT_TIMEOUT_MS = 3_000;

/** Pausa entre ciclos de reconexión cuando se agotan los reintentos (ms) */
const RECONNECT_COOLDOWN_MS = 30_000;

@Injectable()
export class BrokerClientService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(BrokerClientService.name);

    private client!: ClientProxy;

    private connected = false;

    /** Promise activa del ciclo de conexión (compartida entre callers) */
    private connecting?: Promise<void>;

    private reconnectAttempts = 0;
    private readonly maxRetries = 5;
    private readonly baseDelayMs = 500;

    private brokerHost!: string;
    private brokerPort!: number;

    /** Handle del setTimeout del cooldown — se limpia en onModuleDestroy */
    private cooldownTimer?: ReturnType<typeof setTimeout>;

    private breaker!: CircuitBreaker;

    constructor(private readonly configService: ConfigService) { }

    // ===============================
    // LIFECYCLE
    // ===============================

    async onModuleInit(): Promise<void> {
        this.brokerHost = this.configService.get<string>('BROKER_HOST', '127.0.0.1');
        this.brokerPort = this.configService.get<number>('BROKER_PORT', 8000);
        this.logger.log(`Broker configurado → ${this.brokerHost}:${this.brokerPort}`);

        this.client = ClientProxyFactory.create({
            transport: Transport.TCP,
            options: { host: this.brokerHost, port: this.brokerPort },
        });

        this.initCircuitBreaker();

        // No bloqueamos el arranque de la app — conexión en background
        this.startConnectionLoop();
    }

    async onModuleDestroy(): Promise<void> {
        // Cancela el cooldown pendiente para evitar reconexiones post-destroy
        if (this.cooldownTimer) {
            clearTimeout(this.cooldownTimer);
            this.cooldownTimer = undefined;
        }

        try {
            await this.client.close();
        } catch {
            // ignore
        }
    }

    // ===============================
    // CIRCUIT BREAKER
    // ===============================

    private initCircuitBreaker(): void {
        this.breaker = new CircuitBreaker(
            async <T>(pattern: string, data: any): Promise<BrokerResponse<T>> => {
                return this.rawCallBroker<T>(pattern, data);
            },
            {
                timeout: 6000,
                errorThresholdPercentage: 50,
                resetTimeout: 10000,
                rollingCountTimeout: 10000,
                rollingCountBuckets: 10,
            },
        );

        this.breaker.on('open', () => this.logger.warn('Circuit breaker OPEN'));
        this.breaker.on('halfOpen', () => this.logger.warn('Circuit breaker HALF-OPEN'));
        this.breaker.on('close', () => this.logger.log('Circuit breaker CLOSED'));
    }

    // ===============================
    // CONNECTION MANAGEMENT
    // ===============================

    /**
     * Verifica si el broker está conectado
     * @returns boolean
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Inicia un ciclo de conexión en background.
     * Si falla después de maxRetries, espera RECONNECT_COOLDOWN_MS y vuelve a intentar.
     * Nunca lanza error — la app siempre sigue corriendo.
     */
    private startConnectionLoop(): void {
        if (this.connecting) return;

        this.connecting = this.connectWithRetry()
            .catch((err) => {
                this.logger.warn(
                    `${err instanceof Error ? err.message : String(err)} — próximo ciclo en ${RECONNECT_COOLDOWN_MS / 1000}s`,
                );
                this.reconnectAttempts = 0;
                // Fix 3: guardamos el handle para poder cancelarlo en onModuleDestroy
                this.cooldownTimer = setTimeout(() => {
                    this.cooldownTimer = undefined;
                    this.startConnectionLoop();
                }, RECONNECT_COOLDOWN_MS);
            })
            .finally(() => {
                this.connecting = undefined;
            });
    }

    /**
     * Para callers que necesitan conexión activa.
     * Si no hay conexión: inicia reconexión en background y falla rápido
     * con un timeout corto para no bloquear al caller indefinidamente.
     */
    private async ensureConnected(): Promise<void> {
        if (this.connected) return;

        if (!this.connecting) {
            this.startConnectionLoop();
        }

        const connection = this.connecting!;

        const waitTimeout = new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new ServiceUnavailableException('Broker no disponible temporalmente')),
                CALLER_WAIT_TIMEOUT_MS,
            ),
        );

        await Promise.race([connection, waitTimeout]);
    }

    /**
     * Intenta conectar al broker con reintentos exponential backoff.
     * Si falla después de maxRetries, espera RECONNECT_COOLDOWN_MS y vuelve a intentar.
     * Nunca lanza error — la app siempre sigue corriendo.
     */
    private async connectWithRetry(): Promise<void> {
        while (this.reconnectAttempts < this.maxRetries) {
            try {
                this.logger.log(`[${this.reconnectAttempts + 1}/${this.maxRetries}] Intentando conectar al broker...`);

                await this.client.connect();

                this.connected = true;
                this.reconnectAttempts = 0;

                this.logger.log('Conexión establecida con el broker');

                this.attachSocketListeners();

                if (this.breaker.opened) {
                    this.breaker.close();
                }

                return;
            } catch (error) {
                this.reconnectAttempts++;

                const delay = this.baseDelayMs * Math.pow(2, this.reconnectAttempts);

                this.logger.warn(
                    `[${this.reconnectAttempts}/${this.maxRetries}] Conexión fallida — reintentando en ${delay}ms`,
                );

                await this.sleep(delay);
            }
        }

        throw new Error(
            `No se pudo establecer conexión [${this.brokerHost}:${this.brokerPort}] `,
        );
    }

    /**
     * Adjunta listeners al socket del broker para detectar desconexiones inesperadas.
     */
    private attachSocketListeners(): void {
        const socket = (this.client as any)?.socket;

        if (!socket) {
            this.logger.warn('No se pudo obtener el socket del broker — listeners de desconexión no registrados');
            return;
        }

        socket.once('close', () => {
            this.logger.warn('Socket del broker cerrado inesperadamente');
            this.handleBrokerDisconnect();
        });

        socket.once('end', () => {
            this.logger.warn('Socket del broker finalizado por el servidor remoto');
            this.handleBrokerDisconnect();
        });

        socket.once('error', (err: Error) => {
            this.logger.error(`Error en socket del broker: ${err.message}`, err.stack);
            this.handleBrokerDisconnect();
        });
    }

    /**
     * Maneja la desconexión del broker.
     */
    private handleBrokerDisconnect(): void {
        if (!this.connected) return;

        this.logger.warn('Broker desconectado — iniciando reconexión en segundo plano');

        this.connected = false;
        this.reconnectAttempts = 0;

        if (this.breaker.closed) {
            this.breaker.open();
        }

        this.startConnectionLoop();
    }

    // ===============================
    // PUBLIC API
    // ===============================

    // Fix 1: eliminado `await this.ensureConnected()` de cada método público
    // — ya lo hace callBroker internamente, no duplicar

    /**
     * Declara un exchange en el broker.
     * @param exchange ExchangeDeclaration
     * @returns BrokerResponse
     */
    async declareExchange(exchange: ExchangeDeclaration): Promise<BrokerResponse> {
        return this.callBroker<BrokerResponse>('broker.exchange.declare', exchange);
    }

    /**
     * Declara una cola en el broker.
     * @param queue QueueDeclaration
     * @returns BrokerResponse
     */
    async declareQueue(queue: QueueDeclaration): Promise<BrokerResponse> {
        return this.callBroker<BrokerResponse>('broker.queue.declare', queue);
    }

    /**
     * Vincula una cola a un exchange en el broker.
     * @param binding BindingDeclaration
     * @returns BrokerResponse
     */
    async bindQueue(binding: BindingDeclaration): Promise<BrokerResponse> {
        return this.callBroker<BrokerResponse>('broker.queue.bind', binding);
    }

    /**
     * Publica un mensaje en el broker.
     * @param message PublishMessageDto
     * @returns BrokerResponse
     */
    async publish(message: PublishMessageDto): Promise<BrokerResponse> {
        return this.callBroker('broker.message.publish', message);
    }

    /**
     * Consume mensajes del broker.
     * @param clientId Client ID
     * @param queueName Queue name
     * @param limit Limit of messages to consume
     * @param autoAck Auto acknowledge
     * @returns BrokerResponse
     */
    async consumeMessages(clientId: string, queueName: string, limit: number = 1, autoAck: boolean = false): Promise<BrokerResponse> {
        return this.callBroker<BrokerResponse>('broker.message.consume', {
            clientId,
            queueName,
            limit,
            autoAck,
        });
    }

    /**
     * Acknowledge a message in the broker.
     * @param data { clientId: string; queueName: string; messageId: string }
     * @returns BrokerResponse
     */
    async acknowledgeMessage(data: { clientId: string; queueName: string; messageId: string }): Promise<BrokerResponse> {
        return this.callBroker<BrokerResponse>('broker.message.ack', data);
    }

    /**
     * Nack a message in the broker.
     * @param data { messageId: string; requeue: boolean; reason?: string }
     * @returns BrokerResponse
     */
    async nackMessage(data: { messageId: string; requeue: boolean; reason?: string }): Promise<BrokerResponse> {
        return this.callBroker<BrokerResponse>('broker.message.nack', data);
    }

    /**
     * Register as push consumer.
     * @param clientId Client ID
     * @param queue Queue name
     * @param host Host
     * @param port Port
     * @returns BrokerResponse
     */
    async registerAsPushConsumer(clientId: string, queue: string, host: string, port: number): Promise<BrokerResponse> {
        return this.callBroker('broker.registerpush.consumer', {
            clientId,
            queue,
            host,
            port,
            options: { prefetch: 10 },
        });
    }
    // ===============================
    // INTERNAL CALL
    // ===============================

    /**
     * Call broker with retry logic.
     * @param pattern Pattern
     * @param data Data
     * @returns BrokerResponse
     */
    private async callBroker<T>(pattern: string, data: any): Promise<BrokerResponse<T>> {
        await this.ensureConnected();

        let response: BrokerResponse<T>;

        try {
            response = (await this.breaker.fire(pattern, data)) as BrokerResponse<T>;
        } catch (error) {
            this.logger.error(
                `Error en llamada al broker [${pattern}]: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error.stack ?? '' : '',
            );
            throw error;
        }

        // Fix 5: si el broker retorna status 'error', lanzamos excepción en lugar de retornar silenciosamente
        if (response.status === 'error') {
            const msg = response.message ?? `Broker retornó error en [${pattern}]`;
            this.logger.error(`Broker error response [${pattern}]: ${msg}`);
            throw new ServiceUnavailableException(msg);
        }

        return response;
    }

    /**
     * Call broker without retry logic.
     * @param pattern Pattern
     * @param data Data
     * @returns BrokerResponse
     */
    private async rawCallBroker<T>(pattern: string, data: any): Promise<BrokerResponse<T>> {
        try {
            const response = await firstValueFrom(
                this.client.send<BrokerResponse<T>>(pattern, data).pipe(
                    timeout(5000),
                    catchError((error) => {
                        this.logger.error(
                            `Error al enviar mensaje al broker [${pattern}]: ${error instanceof Error ? error.message : String(error)}`,
                            error instanceof Error ? error.stack ?? '' : '',
                        );
                        throw error;
                    }),
                ),
            );

            return response;
        } catch (error) {
            // Fix 2: solo marcamos connected=false en errores reales de red, no en timeouts transitorios
            const code = (error as any)?.code;
            if (NETWORK_ERROR_CODES.has(code)) {
                this.logger.warn(`Error de red detectado [${code}] — broker marcado como desconectado`);
                this.connected = false;
            }
            throw error;
        }
    }

    // ===============================
    // UTILS
    // ===============================

    /**
     * Sleep for a given time.
     * @param ms Time in milliseconds
     * @returns Promise
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
