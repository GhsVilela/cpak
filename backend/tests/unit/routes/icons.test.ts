import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

const { existsMock, getAbsolutePathMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  getAbsolutePathMock: vi.fn(),
}));

vi.mock('../../../src/utils/imageStorage.js', () => ({
  imageStorage: {
    exists: existsMock,
    getAbsolutePath: getAbsolutePathMock,
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    default: {
      ...actual,
      createReadStream: vi.fn().mockReturnValue(new Readable({ read() { this.push(null); } })),
    },
    createReadStream: vi.fn().mockReturnValue(new Readable({ read() { this.push(null); } })),
  };
});

import { getIcon } from '../../../src/api/routes/icons.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    contentType: undefined,
    code(c: number) { reply.statusCode = c; return reply; },
    send(data: any) { reply.body = data; return reply; },
    type(t: string) { reply.contentType = t; return reply; },
  };
  return reply;
}

describe('Icons Route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when icon does not exist', async () => {
    existsMock.mockReturnValue(false);
    const reply = createMockReply();
    await getIcon({ params: { platform: 'steam', gameId: '440', filename: 'icon.png' } } as any, reply);
    expect(reply.statusCode).toBe(404);
  });

  it('streams icon file with correct content type for png', async () => {
    existsMock.mockReturnValue(true);
    getAbsolutePathMock.mockReturnValue('/fake/steam/440/icon.png');

    const reply = createMockReply();
    await getIcon({ params: { platform: 'steam', gameId: '440', filename: 'icon.png' } } as any, reply);
    expect(reply.contentType).toBe('image/png');
  });

  it('streams icon file with correct content type for jpg', async () => {
    existsMock.mockReturnValue(true);
    getAbsolutePathMock.mockReturnValue('/fake/steam/440/icon.jpg');

    const reply = createMockReply();
    await getIcon({ params: { platform: 'steam', gameId: '440', filename: 'icon.jpg' } } as any, reply);
    expect(reply.contentType).toBe('image/jpeg');
  });

  it('uses application/octet-stream for unknown extensions', async () => {
    existsMock.mockReturnValue(true);
    getAbsolutePathMock.mockReturnValue('/fake/steam/440/icon.bmp');

    const reply = createMockReply();
    await getIcon({ params: { platform: 'steam', gameId: '440', filename: 'icon.bmp' } } as any, reply);
    expect(reply.contentType).toBe('application/octet-stream');
  });
});
