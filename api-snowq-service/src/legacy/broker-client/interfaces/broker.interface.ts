



/**
 * Respuesta estándar del broker
 */
export interface BrokerResponse<T = unknown> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
}



/**
 * Reporte de análisis DLQ
 */
export interface DLQAnalysisReport {
  totalMessages: number;
  patterns: Array<{
    reason: string;
    queue: string;
    count: number;
    frequency: number;
    recommendation: string;
  }>;
  recommendations: string[];
}

// Tipos auxiliares
export interface DeliveryResult {
  success: boolean;
  messageId: string;
  clientId: string;
  timestamp: Date;
  error?: string;
}

export class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly context: {
      messageId: string;
      clientId: string;
      queueName: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}
