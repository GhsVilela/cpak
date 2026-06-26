import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import sharp from 'sharp';
import { ImageStorage } from '../../../src/utils/imageStorage.js';

// Mock sharp
vi.mock('sharp', () => {
  const mockMetadata = vi.fn().mockResolvedValue({ width: 800, height: 600, format: 'png' });
  const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from('resized-image'));
  const mockJpeg = vi.fn().mockReturnValue({ toBuffer: mockToBuffer });
  const mockWebp = vi.fn().mockReturnValue({ toBuffer: mockToBuffer });
  const mockResize = vi.fn().mockReturnValue({ jpeg: mockJpeg, webp: mockWebp });
  const mockExtract = vi.fn().mockReturnValue({ resize: vi.fn().mockReturnValue({ webp: mockWebp }) });

  const sharpInstance = {
    metadata: mockMetadata,
    resize: mockResize,
    jpeg: mockJpeg,
    webp: mockWebp,
    extract: mockExtract,
    toBuffer: mockToBuffer,
  };

  const mockSharp = vi.fn().mockReturnValue(sharpInstance);
  return { default: mockSharp, __esModule: true };
});

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readdirSync: vi.fn().mockReturnValue([]),
    rmSync: vi.fn(),
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('raw-image-data')),
    },
  };
});

// Mock fetch
const mockFetchResponse = {
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Map([['content-type', 'image/jpeg']]) as any,
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
};
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));

describe('ImageStorage', () => {
  let storage: ImageStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new ImageStorage();
    // Reset fetch mock
    vi.mocked(fetch).mockResolvedValue({
      ...mockFetchResponse,
      headers: { get: (name: string) => name === 'content-type' ? 'image/jpeg' : null } as any,
    } as any);
  });

  describe('downloadAndStore - hero resize', () => {
    it('resizes hero images to 1920x620 JPEG', async () => {
      const result = await storage.downloadAndStore(
        'https://example.com/hero.png',
        'steam', '12345', 'game', 'hero',
      );

      expect(sharp).toHaveBeenCalled();
      const sharpInstance = vi.mocked(sharp).mock.results[0]?.value;
      expect(sharpInstance.resize).toHaveBeenCalledWith(1920, 620, { fit: 'cover', position: 'centre' });
      expect(result).toContain('game_hero');
    });

    it('skips resize for already-correct hero dimensions', async () => {
      const sharpMock = vi.mocked(sharp);
      sharpMock.mockReturnValueOnce({
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 620, format: 'jpeg' }),
        resize: vi.fn(),
        jpeg: vi.fn().mockReturnValue({ toBuffer: vi.fn() }),
        toBuffer: vi.fn(),
      } as any);

      const result = await storage.downloadAndStore(
        'https://example.com/hero.jpg',
        'steam', '12345', 'game', 'hero',
      );

      const instance = sharpMock.mock.results[0]?.value;
      expect(instance.resize).not.toHaveBeenCalled();
    });
  });

  describe('downloadAndStore - game icon resize', () => {
    it('resizes game icons to 64x64 JPEG when achievementId is game', async () => {
      const result = await storage.downloadAndStore(
        'https://example.com/icon.png',
        'steam', '12345', 'game', 'icon',
      );

      expect(sharp).toHaveBeenCalled();
      const sharpInstance = vi.mocked(sharp).mock.results[0]?.value;
      expect(sharpInstance.resize).toHaveBeenCalledWith(64, 64, { fit: 'cover', position: 'centre' });
      expect(result).toContain('game_icon');
    });

    it('does NOT resize achievement icons to 64x64', async () => {
      const result = await storage.downloadAndStore(
        'https://example.com/icon.png',
        'steam', '12345', 'some-achievement', 'icon',
      );

      // Achievement icons (achievementId !== 'game') should not trigger sharp resize at all
      const sharpInstance = vi.mocked(sharp).mock.results[0]?.value;
      if (sharpInstance) {
        expect(sharpInstance.resize).not.toHaveBeenCalledWith(64, 64, expect.anything());
      }
      // If sharp was never called, that also means no resize happened — test passes
    });
  });

  describe('downloadAndStore - grid resize', () => {
    it('resizes grid images to 600x900 JPEG', async () => {
      const result = await storage.downloadAndStore(
        'https://example.com/grid.png',
        'steam', '12345', 'game', 'grid',
      );

      expect(sharp).toHaveBeenCalled();
      const sharpInstance = vi.mocked(sharp).mock.results[0]?.value;
      expect(sharpInstance.resize).toHaveBeenCalledWith(600, 900, { fit: 'cover', position: 'centre' });
    });
  });

  describe('checkLocalFile', () => {
    it('returns undefined when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = storage.checkLocalFile('steam', '12345', 'game', 'hero');
      expect(result).toBeUndefined();
    });

    it('finds existing hero file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['game_hero.jpg'] as any);
      const result = storage.checkLocalFile('steam', '12345', 'game', 'hero');
      expect(result).toContain('game_hero.jpg');
    });

    it('finds existing icon file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['game_icon.jpg'] as any);
      const result = storage.checkLocalFile('steam', '12345', 'game', 'icon');
      expect(result).toContain('game_icon.jpg');
    });
  });
});
