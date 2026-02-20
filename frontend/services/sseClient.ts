/**
 * T052 & T053: SSE Client for Progress Tracking
 * Provides EventSource management with automatic reconnection, exponential backoff, and type-safe event parsing
 */

import { getConfig } from './config';

// Event types from backend (progressService.ts)
export interface ProgressPayload {
  status: 'preparing' | 'syncing' | 'compressing' | 'extracting' | 'validating' | 'restoring' | 'uploading' | 'downloading';
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  currentStep?: string;
  details?: {
    gamesProcessed?: number;
    achievementsProcessed?: number;
    iconsDownloaded?: number;
    currentBatchSize?: number;
    currentConcurrency?: number;
    collectionsProcessed?: number;
    recordsProcessed?: number;
    imagesRestored?: number;
    fileSize?: number;
  };
  estimatedTimeRemaining?: number;
}

export interface CompletePayload {
  status: 'completed';
  summary: {
    duration: number;
    gamesProcessed?: number;
    achievementsProcessed?: number;
    iconsDownloaded?: number;
    collectionsRestored?: number;
    recordsRestored?: number;
    imagesRestored?: number;
    fileSize?: number;
    warnings?: Array<{ message: string; timestamp: Date }>;
  };
  message: string;
}

export interface ErrorPayload {
  status: 'failed';
  error: {
    code: string;
    message: string;
    details?: any;
  };
  partialProgress?: {
    gamesProcessed?: number;
    achievementsProcessed?: number;
    iconsDownloaded?: number;
  };
}

export interface HeartbeatPayload {
  type: 'heartbeat';
  timestamp: number;
}

export type SSEEvent = ProgressPayload | CompletePayload | ErrorPayload | HeartbeatPayload;

export interface SSEClientOptions {
  operationType: 'sync' | 'backup' | 'restore';
  operationId: string;
  onProgress?: (data: ProgressPayload) => void;
  onComplete?: (data: CompletePayload) => void;
  onError?: (data: ErrorPayload) => void;
  onConnectionError?: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: () => void;
}

/**
 * SSE Client with automatic reconnection and exponential backoff
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private options: SSEClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start at 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isManuallyDisconnected = false;
  private apiBaseUrl: string | null = null;

  constructor(options: SSEClientOptions) {
    this.options = options;
  }

  /**
   * Connect to SSE endpoint
   */
  async connect(): Promise<void> {
    this.isManuallyDisconnected = false;

    // Load API base URL from config
    if (!this.apiBaseUrl) {
      const config = await getConfig();
      this.apiBaseUrl = config.API_BASE_URL;
    }

    const { operationType, operationId } = this.options;
    const url = `${this.apiBaseUrl}/progress/${operationType}/${operationId}`;

    // Fetch initial job status in case operation completed before we connected
    try {
      const statusUrl = operationType === 'sync' 
        ? `${this.apiBaseUrl}/sync/${operationId}/status`
        : operationType === 'backup'
        ? `${this.apiBaseUrl}/backup/progress/${operationId}`
        : `${this.apiBaseUrl}/backup/restore/progress/${operationId}`;
      
      const statusResponse = await fetch(statusUrl);
      if (statusResponse.ok) {
        const jobStatus = await statusResponse.json();
        console.log(`[SSE] Initial ${operationType} status:`, jobStatus);
        
        // If job is already complete, trigger complete callback immediately
        if (jobStatus.status === 'completed') {
          this.options.onComplete?.({
            status: 'completed',
            summary: {
              duration: jobStatus.completedAt ? 
                new Date(jobStatus.completedAt).getTime() - new Date(jobStatus.createdAt).getTime() : 0,
              gamesProcessed: jobStatus.gamesProcessed,
              achievementsProcessed: jobStatus.achievementsProcessed,
              iconsDownloaded: jobStatus.iconsDownloaded,
              collectionsRestored: jobStatus.collectionsRestored,
              recordsRestored: jobStatus.recordsRestored,
              imagesRestored: jobStatus.imagesRestored,
              warnings: jobStatus.warnings,
            },
            message: `${operationType.charAt(0).toUpperCase() + operationType.slice(1)} completed successfully`
          });
          return; // Don't connect to SSE if already complete
        }
        
        // If job is in progress, send current progress
        if (jobStatus.status && jobStatus.status !== 'pending') {
          const progressPercentage = jobStatus.recordsRestored && jobStatus.totalRecords
            ? Math.round((jobStatus.recordsRestored / jobStatus.totalRecords) * 100)
            : jobStatus.collectionsRestored && jobStatus.totalCollections
            ? Math.round((jobStatus.collectionsRestored / jobStatus.totalCollections) * 100)
            : 0;
            
          this.options.onProgress?.({
            status: jobStatus.status as any,
            progress: {
              current: jobStatus.recordsRestored || jobStatus.collectionsRestored || 0,
              total: jobStatus.totalRecords || jobStatus.totalCollections || 100,
              percentage: progressPercentage
            },
            currentStep: `${jobStatus.status.charAt(0).toUpperCase() + jobStatus.status.slice(1)}...`,
            details: {
              collectionsProcessed: jobStatus.collectionsRestored,
              recordsProcessed: jobStatus.recordsRestored,
              imagesRestored: jobStatus.imagesRestored,
              gamesProcessed: jobStatus.gamesProcessed,
              achievementsProcessed: jobStatus.achievementsProcessed,
              iconsDownloaded: jobStatus.iconsDownloaded,
            }
          });
        }
      }
    } catch (error) {
      console.warn(`[SSE] Failed to fetch initial ${operationType} status, continuing with SSE:`, error);
    }

    try {
      this.eventSource = new EventSource(url);

      // Handle progress events
      this.eventSource.addEventListener('progress', (event: MessageEvent) => {
        try {
          const data: ProgressPayload = JSON.parse(event.data);
          this.reconnectAttempts = 0; // Reset on successful message
          this.options.onProgress?.(data);
        } catch (error) {
          console.error('Failed to parse progress event:', error);
        }
      });

      // Handle complete events
      this.eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          const data: CompletePayload = JSON.parse(event.data);
          this.options.onComplete?.(data);
          this.disconnect(); // Auto-disconnect on completion
        } catch (error) {
          console.error('Failed to parse complete event:', error);
        }
      });

      // Handle error events (from backend, not connection errors)
      this.eventSource.addEventListener('error-event', (event: MessageEvent) => {
        try {
          const data: ErrorPayload = JSON.parse(event.data);
          this.options.onError?.(data);
          this.disconnect(); // Auto-disconnect on error
        } catch (error) {
          console.error('Failed to parse error event:', error);
        }
      });

      // Handle heartbeat events (keep connection alive)
      this.eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
        try {
          const data: HeartbeatPayload = JSON.parse(event.data);
          // Heartbeat received, connection is healthy
          this.reconnectAttempts = 0;
        } catch (error) {
          console.error('Failed to parse heartbeat event:', error);
        }
      });

      // Handle connection errors (EventSource onerror for network issues)
      this.eventSource.onerror = (error: Event) => {
        if (this.isManuallyDisconnected) {
          return; // Don't reconnect if manually disconnected
        }

        console.error('SSE connection error:', error);
        
        // Close current connection
        this.eventSource?.close();
        this.eventSource = null;

        // Attempt reconnection with exponential backoff
        this.scheduleReconnect();
      };

      // Handle connection open
      this.eventSource.onopen = () => {
        console.log(`SSE connected: ${operationType}/${operationId}`);
        if (this.reconnectAttempts > 0) {
          this.options.onReconnected?.();
        }
        this.reconnectAttempts = 0;
      };

    } catch (error) {
      console.error('Failed to create EventSource:', error);
      this.options.onConnectionError?.(error as Error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const error = new Error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      this.options.onConnectionError?.(error);
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    this.options.onReconnecting?.(this.reconnectAttempts);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Manually disconnect (stops reconnection)
   */
  disconnect(): void {
    this.isManuallyDisconnected = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.reconnectAttempts = 0;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /**
   * Get current reconnection attempt count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}

/**
 * Factory function for creating SSE clients
 */
export function createSSEClient(options: SSEClientOptions): SSEClient {
  return new SSEClient(options);
}
