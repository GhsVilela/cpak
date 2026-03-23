import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear any cached config
    delete (window as any).__CONFIG__;
    delete (globalThis as any).__CONFIG__;
  });

  it('returns window.__CONFIG__ if available', async () => {
    (window as any).__CONFIG__ = { API_BASE_URL: 'http://test/api' };
    const { getConfig } = await import('../../services/config');
    const config = await getConfig();
    expect(config.API_BASE_URL).toBe('http://test/api');
  });

  it('fell back to fetch /config.json when window.__CONFIG__ is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ API_BASE_URL: 'http://fetched/api' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { getConfig } = await import('../../services/config');
    const config = await getConfig();
    expect(config.API_BASE_URL).toBe('http://fetched/api');
    expect(mockFetch).toHaveBeenCalledWith('/config.json');
    vi.unstubAllGlobals();
  });

  it('falls back to defaults when fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', mockFetch);

    const { getConfig } = await import('../../services/config');
    const config = await getConfig();
    expect(config.API_BASE_URL).toBe('/api');
    vi.unstubAllGlobals();
  });

  it('caches config after first call', async () => {
    (window as any).__CONFIG__ = { API_BASE_URL: 'http://cached/api' };
    const { getConfig } = await import('../../services/config');
    const first = await getConfig();
    // Change the window config — should return cached
    (window as any).__CONFIG__ = { API_BASE_URL: 'http://changed/api' };
    const second = await getConfig();
    expect(second.API_BASE_URL).toBe('http://cached/api');
  });
});
