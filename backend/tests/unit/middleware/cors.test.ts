import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock getAllowedOrigins before importing the module under test
vi.mock('../../../src/utils/config.js', () => ({
  getAllowedOrigins: vi.fn().mockReturnValue(['*']),
  config: { ALLOWED_ORIGINS: '*' },
}));

import { corsMiddleware } from '../../../src/api/middleware/cors.js';
import { getAllowedOrigins } from '../../../src/utils/config.js';

function createMockRequest(opts: { origin?: string; method?: string } = {}) {
  return {
    headers: { origin: opts.origin },
    method: opts.method || 'GET',
  } as any;
}

function createMockReply() {
  const headers: Record<string, string> = {};
  const reply = {
    header: vi.fn((key: string, val: string) => { headers[key] = val; return reply; }),
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
    _headers: headers,
  };
  return reply as any;
}

describe('corsMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets wildcard origin when ALLOWED_ORIGINS=*', async () => {
    vi.mocked(getAllowedOrigins).mockReturnValue(['*']);
    const req = createMockRequest({ origin: 'http://example.com' });
    const reply = createMockReply();
    await corsMiddleware(req, reply);
    expect(reply.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
  });

  it('sets specific origin when it matches allowed list', async () => {
    vi.mocked(getAllowedOrigins).mockReturnValue(['http://myapp.com']);
    const req = createMockRequest({ origin: 'http://myapp.com' });
    const reply = createMockReply();
    await corsMiddleware(req, reply);
    expect(reply.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://myapp.com');
  });

  it('does not set origin header when origin is not in allowed list', async () => {
    vi.mocked(getAllowedOrigins).mockReturnValue(['http://allowed.com']);
    const req = createMockRequest({ origin: 'http://evil.com' });
    const reply = createMockReply();
    await corsMiddleware(req, reply);
    const originCalls = reply.header.mock.calls.filter(
      (c: string[]) => c[0] === 'Access-Control-Allow-Origin',
    );
    expect(originCalls).toHaveLength(0);
  });

  it('sets standard CORS headers', async () => {
    vi.mocked(getAllowedOrigins).mockReturnValue(['*']);
    const req = createMockRequest({ origin: 'http://x.com' });
    const reply = createMockReply();
    await corsMiddleware(req, reply);
    expect(reply.header).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    expect(reply.header).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    expect(reply.header).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
  });

  it('responds with 204 for OPTIONS preflight', async () => {
    vi.mocked(getAllowedOrigins).mockReturnValue(['*']);
    const req = createMockRequest({ origin: 'http://x.com', method: 'OPTIONS' });
    const reply = createMockReply();
    await corsMiddleware(req, reply);
    expect(reply.code).toHaveBeenCalledWith(204);
    expect(reply.send).toHaveBeenCalled();
  });

  it('does not send 204 for non-OPTIONS requests', async () => {
    vi.mocked(getAllowedOrigins).mockReturnValue(['*']);
    const req = createMockRequest({ origin: 'http://x.com', method: 'GET' });
    const reply = createMockReply();
    await corsMiddleware(req, reply);
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
