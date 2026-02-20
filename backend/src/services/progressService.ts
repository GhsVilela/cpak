import { FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';

/**
 * Progress event types
 */
export type ProgressEventType = 'progress' | 'complete' | 'error' | 'heartbeat';

/**
 * Base progress event structure
 */
export interface ProgressEvent {
  type: ProgressEventType;
  operationId: string;
  timestamp: string;
  payload: ProgressPayload | CompletePayload | ErrorPayload | null;
}

/**
 * Progress update payload
 */
export interface ProgressPayload {
  status: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  currentStep: string;
  estimatedTimeRemaining?: number;
  details?: Record<string, any>;
}

/**
 * Completion event payload
 */
export interface CompletePayload {
  status: 'completed';
  summary: Record<string, any>;
  message: string;
}

/**
 * Error event payload
 */
export interface ErrorPayload {
  status: 'failed';
  error: {
    code: string;
    message: string;
    details?: any;
  };
  partialProgress?: {
    itemsProcessed: number;
    percentage: number;
  };
}

/**
 * SSE connection callback type
 */
type SSECallback = (data: ProgressEvent) => void;

/**
 * Client connection information
 */
interface ClientConnection {
  operationId: string;
  callback: SSECallback;
  connectedAt: Date;
  lastHeartbeat: Date;
}

/**
 * Progress Service
 * 
 * Manages Server-Sent Events (SSE) connections for real-time progress updates.
 * Provides broadcasing capabilities for sync, backup, and restore operations.
 */
export class ProgressService {
  private connections: Map<string, ClientConnection[]> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly heartbeatFrequency = 30000; // 30 seconds
  private readonly maxConnectionsPerOperation = 10;
  private readonly connectionTimeout = 300000; // 5 minutes
  
  constructor() {
    this.startHeartbeat();
    logger.info('ProgressService initialized');
  }
  
  /**
   * Register an SSE connection for an operation
   * 
   * @param operationId - Unique operation identifier
   * @param callback - Function to send events to the client
   */
  registerConnection(operationId: string, callback: SSECallback): void {
    const client: ClientConnection = {
      operationId,
      callback,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };
    
    const existing = this.connections.get(operationId) || [];
    
    // Limit connections per operation
    if (existing.length >= this.maxConnectionsPerOperation) {
      logger.warn({ operationId, connectionCount: existing.length }, 'Max connections reached for operation');
      // Remove oldest connection
      const oldest = existing.shift();
      if (oldest) {
        this.sendEvent(oldest, {
          type: 'error',
          operationId,
          timestamp: new Date().toISOString(),
          payload: {
            status: 'failed',
            error: {
              code: 'MAX_CONNECTIONS_EXCEEDED',
              message: 'Maximum number of connections exceeded for this operation',
            },
          },
        });
      }
    }
    
    existing.push(client);
    this.connections.set(operationId, existing);
    
    logger.debug({ operationId, totalConnections: existing.length }, 'SSE connection registered');
  }
  
  /**
   * Unregister an SSE connection
   * 
   * @param operationId - Operation identifier
   * @param callback - Optional specific callback to remove
   */
  unregisterConnection(operationId: string, callback?: SSECallback): void {
    const existing = this.connections.get(operationId);
    if (!existing) return;
    
    if (callback) {
      const filtered = existing.filter(c => c.callback !== callback);
      if (filtered.length > 0) {
        this.connections.set(operationId, filtered);
      } else {
        this.connections.delete(operationId);
      }
    } else {
      this.connections.delete(operationId);
    }
    
    logger.debug({ operationId }, 'SSE connection unregistered');
  }
  
  /**
   * Broadcast a progress update to all connected clients for an operation
   * 
   * @param operationId - Operation identifier
   * @param payload - Progress data
   */
  broadcastProgress(operationId: string, payload: ProgressPayload): void {
    const event: ProgressEvent = {
      type: 'progress',
      operationId,
      timestamp: new Date().toISOString(),
      payload,
    };
    
    this.broadcastEvent(operationId, event);
  }
  
  /**
   * Broadcast a completion event
   * 
   * @param operationId - Operation identifier
   * @param payload - Completion data
   */
  broadcastComplete(operationId: string, payload: CompletePayload): void {
    const event: ProgressEvent = {
      type: 'complete',
      operationId,
      timestamp: new Date().toISOString(),
      payload,
    };
    
    this.broadcastEvent(operationId, event);
    
    // Close connections after completion
    this.unregisterConnection(operationId);
  }
  
  /**
   * Broadcast an error event
   * 
   * @param operationId - Operation identifier
   * @param payload - Error data
   */
  broadcastError(operationId: string, payload: ErrorPayload): void {
    const event: ProgressEvent = {
      type: 'error',
      operationId,
      timestamp: new Date().toISOString(),
      payload,
    };
    
    this.broadcastEvent(operationId, event);
    
    // Close connections after error
    this.unregisterConnection(operationId);
  }
  
  /**
   * Broadcast an event to all clients for an operation
   */
  private broadcastEvent(operationId: string, event: ProgressEvent): void {
    const clients = this.connections.get(operationId);
    if (!clients || clients.length === 0) {
      logger.debug({ operationId, eventType: event.type }, 'No clients connected for broadcast');
      return;
    }
    
    logger.debug({ operationId, eventType: event.type, clientCount: clients.length }, 'Broadcasting event');
    
    for (const client of clients) {
      this.sendEvent(client, event);
    }
  }
  
  /**
   * Send an event to a specific client
   */
  private sendEvent(client: ClientConnection, event: ProgressEvent): void {
    try {
      client.callback(event);
      client.lastHeartbeat = new Date();
    } catch (error) {
      logger.error({ error, operationId: client.operationId }, 'Failed to send SSE event to client');
    }
  }
  
  /**
   * Start heartbeat mechanism to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      
      for (const [operationId, clients] of this.connections.entries()) {
        // Remove stale connections
        const activeClients = clients.filter(client => {
          const timeSinceLastHeartbeat = now.getTime() - client.lastHeartbeat.getTime();
          return timeSinceLastHeartbeat < this.connectionTimeout;
        });
        
        if (activeClients.length !== clients.length) {
          logger.info({
            operationId,
            removedCount: clients.length - activeClients.length,
            activeCount: activeClients.length,
          }, 'Removed stale SSE connections');
        }
        
        // Send heartbeat to active clients
        for (const client of activeClients) {
          const heartbeatEvent: ProgressEvent = {
            type: 'heartbeat',
            operationId,
            timestamp: new Date().toISOString(),
            payload: null,
          };
          
          this.sendEvent(client, heartbeatEvent);
        }
        
        if (activeClients.length > 0) {
          this.connections.set(operationId, activeClients);
        } else {
          this.connections.delete(operationId);
        }
      }
    }, this.heartbeatFrequency);
    
    logger.info({ heartbeatFrequency: this.heartbeatFrequency }, 'SSE heartbeat started');
  }
  
  /**
   * Stop heartbeat mechanism
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('SSE heartbeat stopped');
    }
  }
  
  /**
   * Get statistics about active connections
   */
  getStats() {
    return {
      totalOperations: this.connections.size,
      totalConnections: Array.from(this.connections.values()).reduce((sum, clients) => sum + clients.length, 0),
      operations: Array.from(this.connections.entries()).map(([operationId, clients]) => ({
        operationId,
        connectionCount: clients.length,
        oldestConnection: Math.min(...clients.map(c => c.connectedAt.getTime())),
      })),
    };
  }
  
  /**
   * Cleanup on service shutdown
   */
  shutdown(): void {
    this.stopHeartbeat();
    this.connections.clear();
    logger.info('ProgressService shut down');
  }
}

// Export singleton instance
export const progressService = new ProgressService();
