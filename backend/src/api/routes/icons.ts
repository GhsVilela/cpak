import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { iconStorage } from '../../utils/iconStorage.js';
import * as fs from 'fs';
import * as path from 'path';

interface IconParams {
  platform: string;
  gameId: string;
  filename: string;
}

export async function getIcon(
  request: FastifyRequest<{ Params: IconParams }>,
  reply: FastifyReply
): Promise<void> {
  const { platform, gameId, filename } = request.params;

  // Construct the relative path
  const relativePath = path.join(platform, gameId, filename);
  const absolutePath = iconStorage.getAbsolutePath(relativePath);

  // Check if file exists
  if (!iconStorage.exists(relativePath)) {
    return reply.code(404).send({ error: 'Icon not found' });
  }

  // Determine content type based on file extension
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';

  // Stream the file
  const stream = fs.createReadStream(absolutePath);
  reply.type(contentType);
  return reply.send(stream);
}

export async function registerIconRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/icons/:platform/:gameId/:filename', getIcon);
}
