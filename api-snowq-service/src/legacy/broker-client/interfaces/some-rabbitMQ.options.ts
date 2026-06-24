import { BindingDeclaration, ExchangeDeclaration, QueueDeclaration } from "./some-rabbitMq.interface";

export interface BrokerClientOptions {
    clientId: string;
    brokerHost: string;
    brokerPort: number;
    exchange: ExchangeDeclaration;
    queue: QueueDeclaration;
    binding?: BindingDeclaration;
    retryAttempts?: number;
    retryDelay?: number;
    maxRetries?: number;
    routingKey?: string;
    timeout?: number;
    prefetch?: number;
    autoAck?: boolean;
    consumerHost?: string;
    consumerPort?: number;
    autoDeclare?: boolean; // Si declarar automáticamente recursos
    healthCheck?: { enabled?: boolean; interval?: number; failureThreshold?: number };
}
