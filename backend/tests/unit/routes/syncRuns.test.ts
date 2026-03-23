import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const { syncRunFindMock, syncRunFindByIdMock } = vi.hoisted(() => ({
  syncRunFindMock: vi.fn(),
  syncRunFindByIdMock: vi.fn(),
}));

vi.mock('../../../src/models/syncRun.js', () => {
  const chainable = (result: any) => ({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(result),
      }),
    }),
  });

  return {
    SyncRun: {
      find: syncRunFindMock.mockImplementation(() => chainable([])),
      findById: syncRunFindByIdMock.mockImplementation(() => ({
        populate: vi.fn().mockResolvedValue(null),
      })),
    },
  };
});

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { syncRunsRoutes } from '../../../src/api/routes/syncRuns.js';

describe('syncRuns routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(syncRunsRoutes);
    await app.ready();
  });

  // GET /runs

  it('GET /runs returns empty array when no runs exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/runs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('GET /runs filters by profileId when provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/runs?profileId=507f1f77bcf86cd799439011',
    });
    expect(res.statusCode).toBe(200);
    expect(syncRunFindMock).toHaveBeenCalled();
  });

  it('GET /runs returns 500 on database error', async () => {
    syncRunFindMock.mockImplementation(() => ({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          populate: vi.fn().mockRejectedValue(new Error('DB fail')),
        }),
      }),
    }));

    const res = await app.inject({ method: 'GET', url: '/runs' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('Failed to retrieve sync runs');
  });

  // GET /runs/:id

  it('GET /runs/:id returns 400 for invalid ObjectId', async () => {
    const res = await app.inject({ method: 'GET', url: '/runs/not-valid-id' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid sync run ID');
  });

  it('GET /runs/:id returns 404 when run not found', async () => {
    syncRunFindByIdMock.mockReturnValue({
      populate: vi.fn().mockResolvedValue(null),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runs/507f1f77bcf86cd799439011',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /runs/:id returns the sync run', async () => {
    const mockRun = { _id: '507f1f77bcf86cd799439011', status: 'completed' };
    syncRunFindByIdMock.mockReturnValue({
      populate: vi.fn().mockResolvedValue(mockRun),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runs/507f1f77bcf86cd799439011',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });

  it('GET /runs/:id returns 500 on database error', async () => {
    syncRunFindByIdMock.mockReturnValue({
      populate: vi.fn().mockRejectedValue(new Error('DB fail')),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/runs/507f1f77bcf86cd799439011',
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('Failed to retrieve sync run');
  });
});
