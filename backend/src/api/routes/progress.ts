import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { progressService } from '../../services/progressService.js';
import { logger } from '../../utils/logger.js';

/**
 * Progress Routes
 * 
 * SSE (Server-Sent Events) endpoints for real-time progress tracking.
 * 
 * Endpoints:
 * - GET /progress/sync/:operationId - Subscribe to sync operation progress
 * - GET /progress/backup/:jobId - Subscribe to backup operation progress
 * - GET /progress/restore/:jobId - Subscribe to restore operation progress
 */

interface ProgressParams {
  operationId?: string;
  jobId?: string;
}

export default async function progressRoutes(fastify: FastifyInstance) {
  /**
   * GET /progress/sync/:operationId
   * 
   * Subscribe to progress updates for a sync operation
   */
  fastify.get<{ Params: ProgressParams }>(
    '/progress/sync/:operationId',
    async (request: FastifyRequest<{ Params: ProgressParams }>, reply: FastifyReply) => {
      const { operationId } = request.params;
      
      if (!operationId) {
        return reply.code(400).send({ error: 'operationId is required' });
      }
      
      logger.info({ operationId }, 'SSE connection established for sync operation');
      
      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });
      
      // Callback to send events to client
      const sendEvent = (event: any) => {
        try {
          // Send event type and data separately for proper SSE format
          const eventType = event.type === 'error' ? 'error-event' : event.type; // Avoid conflict with error events
          reply.raw.write(`event: ${eventType}\n`);
          reply.raw.write(`data: ${JSON.stringify(event.payload || event)}\n\n`);
        } catch (error) {
          logger.error({ error, operationId }, 'Failed to write SSE data');
        }
      };
      
      // Register connection
      progressService.registerConnection(operationId, sendEvent);
      
      // Handle client disconnect
      request.raw.on('close', () => {
        logger.info({ operationId }, 'SSE connection closed for sync operation');
        progressService.unregisterConnection(operationId, sendEvent);
      });
      
      // Keep connection alive (prevent Fastify from closing it immediately)
      reply.hijack();
    }
  );
  
  /**
   * GET /progress/backup/:jobId
   * 
   * Subscribe to progress updates for a backup operation
   */
  fastify.get<{ Params: ProgressParams }>(
    '/progress/backup/:jobId',
    async (request: FastifyRequest<{ Params: ProgressParams }>, reply: FastifyReply) => {
      const { jobId } = request.params;
      
      if (!jobId) {
        return reply.code(400).send({ error: 'jobId is required' });
      }
      
      logger.info({ jobId }, 'SSE connection established for backup operation');
      
      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      
      // Callback to send events to client
      const sendEvent = (event: any) => {
        try {
          // Send event type and data separately for proper SSE format
          const eventType = event.type === 'error' ? 'error-event' : event.type; // Avoid conflict with error events
          reply.raw.write(`event: ${eventType}\n`);
          reply.raw.write(`data: ${JSON.stringify(event.payload || event)}\n\n`);
        } catch (error) {
          logger.error({ error, jobId }, 'Failed to write SSE data');
        }
      };
      
      // Register connection
      progressService.registerConnection(jobId, sendEvent);
      
      // Handle client disconnect
      request.raw.on('close', () => {
        logger.info({ jobId }, 'SSE connection closed for backup operation');
        progressService.unregisterConnection(jobId, sendEvent);
      });
      
      // Keep connection alive
      reply.hijack();
    }
  );
  
  /**
   * GET /progress/restore/:jobId
   * 
   * Subscribe to progress updates for a restore operation
   */
  fastify.get<{ Params: ProgressParams }>(
    '/progress/restore/:jobId',
    async (request: FastifyRequest<{ Params: ProgressParams }>, reply: FastifyReply) => {
      const { jobId } = request.params;
      
      if (!jobId) {
        return reply.code(400).send({ error: 'jobId is required' });
      }
      
      logger.info({ jobId }, 'SSE connection established for restore operation');
      
      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      
      // Callback to send events to client
      const sendEvent = (event: any) => {
        try {
          // Send event type and data separately for proper SSE format
          const eventType = event.type === 'error' ? 'error-event' : event.type; // Avoid conflict with error events
          reply.raw.write(`event: ${eventType}\n`);
          reply.raw.write(`data: ${JSON.stringify(event.payload || event)}\n\n`);
        } catch (error) {
          logger.error({ error, jobId }, 'Failed to write SSE data');
        }
      };
      
      // Register connection
      progressService.registerConnection(jobId, sendEvent);
      
      // Handle client disconnect
      request.raw.on('close', () => {
        logger.info({ jobId }, 'SSE connection closed for restore operation');
        progressService.unregisterConnection(jobId, sendEvent);
      });
      
      // Keep connection alive
      reply.hijack();
    }
  );
}
