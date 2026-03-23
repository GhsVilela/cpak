import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSettingMock, getAllSettingsMock, setSettingMock, deleteSettingMock, getSettingForDisplayMock, reloadMock } = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
  getAllSettingsMock: vi.fn(),
  setSettingMock: vi.fn(),
  deleteSettingMock: vi.fn(),
  getSettingForDisplayMock: vi.fn(),
  reloadMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/services/configService.js', () => ({
  configService: {
    getSetting: getSettingMock,
    getAllSettings: getAllSettingsMock,
    setSetting: setSettingMock,
    deleteSetting: deleteSettingMock,
    getSettingForDisplay: getSettingForDisplayMock,
  },
}));

vi.mock('../../../src/services/scheduler.js', () => ({
  schedulerService: { reload: reloadMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getAllSettings, getSetting, updateSetting, deleteSetting } from '../../../src/api/routes/settings.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: any) { reply.body = data; return reply; },
  };
  return reply;
}

describe('Settings Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- getAllSettings ---

  describe('getAllSettings', () => {
    it('returns masked settings (hides secret values)', async () => {
      getAllSettingsMock.mockResolvedValue([
        { key: 'steam_api_key', category: 'steam', isSecret: true, value: 'secret123' },
        { key: 'scheduler_enabled', category: 'scheduler', isSecret: false, value: 'true' },
      ]);

      const reply = createMockReply();
      await getAllSettings({} as any, reply);

      expect(reply.body.settings).toHaveLength(2);
      // Secret setting should not have value
      expect(reply.body.settings[0].value).toBeUndefined();
      expect(reply.body.settings[0].isSecret).toBe(true);
      // Non-secret setting should have value
      expect(reply.body.settings[1].value).toBe('true');
    });

    it('returns 500 on error', async () => {
      getAllSettingsMock.mockRejectedValue(new Error('DB error'));
      const reply = createMockReply();
      await getAllSettings({} as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- getSetting ---

  describe('getSetting', () => {
    it('returns setting when found', async () => {
      getSettingForDisplayMock.mockResolvedValue({ key: 'test_key', value: 'val', category: 'general' });
      const reply = createMockReply();
      await getSetting({ params: { key: 'test_key' } } as any, reply);
      expect(reply.body.key).toBe('test_key');
    });

    it('returns 404 when setting not found', async () => {
      getSettingForDisplayMock.mockResolvedValue(null);
      const reply = createMockReply();
      await getSetting({ params: { key: 'missing_key' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 for invalid key format', async () => {
      const reply = createMockReply();
      await getSetting({ params: { key: 'INVALID-KEY!' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 400 for empty key', async () => {
      const reply = createMockReply();
      await getSetting({ params: { key: '' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 500 on error', async () => {
      getSettingForDisplayMock.mockRejectedValue(new Error('DB'));
      const reply = createMockReply();
      await getSetting({ params: { key: 'valid_key' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- updateSetting ---

  describe('updateSetting', () => {
    it('updates setting and returns success', async () => {
      setSettingMock.mockResolvedValue(undefined);
      const reply = createMockReply();
      await updateSetting({
        params: { key: 'test_key' },
        body: { value: 'new_value', category: 'sync' },
      } as any, reply);
      expect(reply.body.success).toBe(true);
      expect(setSettingMock).toHaveBeenCalledWith('test_key', 'new_value', 'sync');
    });

    it('returns 400 for invalid key format', async () => {
      const reply = createMockReply();
      await updateSetting({
        params: { key: 'BAD-KEY' },
        body: { value: 'x', category: 'sync' },
      } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 400 for invalid body', async () => {
      const reply = createMockReply();
      await updateSetting({
        params: { key: 'valid_key' },
        body: { value: '', category: 'sync' }, // empty value fails min(1)
      } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('reloads scheduler when scheduler setting is updated', async () => {
      vi.useFakeTimers();
      setSettingMock.mockResolvedValue(undefined);
      const reply = createMockReply();
      await updateSetting({
        params: { key: 'scheduler_enabled' },
        body: { value: 'true', category: 'scheduler' },
      } as any, reply);
      expect(reply.body.success).toBe(true);
      // Scheduler reload is debounced (150ms)
      vi.advanceTimersByTime(200);
      expect(reloadMock).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('returns 500 on error', async () => {
      setSettingMock.mockRejectedValue(new Error('DB'));
      const reply = createMockReply();
      await updateSetting({
        params: { key: 'valid_key' },
        body: { value: 'somevalue', category: 'sync' },
      } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- deleteSetting ---

  describe('deleteSetting', () => {
    it('deletes setting and returns success', async () => {
      deleteSettingMock.mockResolvedValue(true);
      const reply = createMockReply();
      await deleteSetting({ params: { key: 'some_key' } } as any, reply);
      expect(reply.body.success).toBe(true);
    });

    it('returns 404 when setting not found', async () => {
      deleteSettingMock.mockResolvedValue(false);
      const reply = createMockReply();
      await deleteSetting({ params: { key: 'missing_key' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 for invalid key format', async () => {
      const reply = createMockReply();
      await deleteSetting({ params: { key: 'BAD!' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('reloads scheduler when scheduler setting is deleted', async () => {
      deleteSettingMock.mockResolvedValue(true);
      const reply = createMockReply();
      await deleteSetting({ params: { key: 'scheduler_cron' } } as any, reply);
      expect(reloadMock).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
      deleteSettingMock.mockRejectedValue(new Error('DB'));
      const reply = createMockReply();
      await deleteSetting({ params: { key: 'valid_key' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });
});
