// // src/index.ts
// import 'reflect-metadata';
// import { Container } from 'inversify';
// import { Server } from './presentation/http/http-server';
// import { RabbitMQConsumer } from './infrastructure/messaging/rabbitmq/rabbitmq.consumer';
// import { DatabaseConnection } from './infrastructure/persistence/database/postgres.connection';
// import { RedisService } from './infrastructure/cache/redis.service';
// import { Logger } from './infrastructure/logging/logger.service';
// import { MetricsService } from './infrastructure/monitoring/metrics.service';
// import { Config } from './infrastructure/config/environment';

// class IntegrationService {
//     private container: Container;
//     private server: Server;
//     private rabbitMQConsumer: RabbitMQConsumer;
//     private database: DatabaseConnection;
//     private redis: RedisService;
//     private logger: Logger;
//     private metrics: MetricsService;

//     constructor() {
//         this.container = new Container();
//         this.logger = new Logger();
//         this.metrics = new MetricsService();

//         this.configureContainer();
//     }

//     private configureContainer(): void {
//         // Configurar inversify container
//         // ... configuración de dependencias
//     }

//     async start(): Promise<void> {
//         try {
//             this.logger.info('Starting Integration Service...');

//             // 1. Conectar a base de datos
//             this.database = new DatabaseConnection(Config.database);
//             await this.database.connect();
//             this.logger.info('Database connected successfully');

//             // 2. Conectar a Redis
//             this.redis = new RedisService(Config.redis);
//             await this.redis.connect();
//             this.logger.info('Redis connected successfully');

//             // 3. Inicializar RabbitMQ Consumer
//             this.rabbitMQConsumer = this.container.get(RabbitMQConsumer);
//             await this.rabbitMQConsumer.connect();
//             await this.rabbitMQConsumer.startConsuming();
//             this.logger.info('RabbitMQ consumer started');

//             // 4. Iniciar servidor HTTP
//             this.server = this.container.get(Server);
//             await this.server.start();
//             this.logger.info(`HTTP server started on port ${Config.server.port}`);

//             // 5. Configurar graceful shutdown
//             this.setupGracefulShutdown();

//             this.logger.info('Integration Service started successfully');

//         } catch (error) {
//             this.logger.error('Failed to start Integration Service', { error });
//             process.exit(1);
//         }
//     }

//     private setupGracefulShutdown(): void {
//         const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

//         signals.forEach(signal => {
//             process.on(signal, async () => {
//                 this.logger.info(`Received ${signal}, starting graceful shutdown...`);

//                 await this.shutdown();

//                 this.logger.info('Graceful shutdown completed');
//                 process.exit(0);
//             });
//         });
//     }

//     async shutdown(): Promise<void> {
//         const shutdownPromises = [];

//         if (this.server) {
//             shutdownPromises.push(this.server.stop());
//         }

//         if (this.rabbitMQConsumer) {
//             shutdownPromises.push(this.rabbitMQConsumer.disconnect());
//         }

//         if (this.redis) {
//             shutdownPromises.push(this.redis.disconnect());
//         }

//         if (this.database) {
//             shutdownPromises.push(this.database.disconnect());
//         }

//         await Promise.allSettled(shutdownPromises);
//     }
// }

// // Iniciar aplicación
// const app = new IntegrationService();
// app.start().catch(error => {
//     console.error('Failed to start application:', error);
//     process.exit(1);
// });