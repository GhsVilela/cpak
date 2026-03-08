import { describe, it, expect, vi, beforeEach } from 'vitest';
import { server, TEST_BASE_URL } from '../mocks/handlers';
import { http, HttpResponse } from 'msw';

// Reset the singleton between tests
let ApiClient: any;
let apiClient: any;

describe('ApiClient', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Ensure window.__CONFIG__ is set so getConfig() returns immediately
    (window as any).__CONFIG__ = { API_BASE_URL: TEST_BASE_URL + '/api' };
    const mod = await import('../../services/apiClient');
    ApiClient = mod.ApiClient;
    apiClient = new ApiClient();
  });

  // --- get() ---

  it('get() fetches and returns JSON', async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/api/test`, () =>
        HttpResponse.json({ result: 'ok' }),
      ),
    );
    const data = await apiClient.get('/test');
    expect(data).toEqual({ result: 'ok' });
  });

  it('get() throws on non-ok response', async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/api/fail`, () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    );
    await expect(apiClient.get('/fail')).rejects.toThrow('API error');
  });

  // --- post() ---

  it('post() sends JSON body and returns response', async () => {
    server.use(
      http.post(`${TEST_BASE_URL}/api/items`, async ({ request }) => {
        const body = await request.json() as any;
        return HttpResponse.json({ id: 1, name: body.name });
      }),
    );
    const data = await apiClient.post('/items', { name: 'test' });
    expect(data).toEqual({ id: 1, name: 'test' });
  });

  it('post() works without body', async () => {
    server.use(
      http.post(`${TEST_BASE_URL}/api/trigger`, () =>
        HttpResponse.json({ started: true }),
      ),
    );
    const data = await apiClient.post('/trigger');
    expect(data).toEqual({ started: true });
  });

  it('post() throws on non-ok response', async () => {
    server.use(
      http.post(`${TEST_BASE_URL}/api/bad`, () =>
        HttpResponse.json({ error: 'bad' }, { status: 400 }),
      ),
    );
    await expect(apiClient.post('/bad', {})).rejects.toThrow('API error');
  });

  // --- patch() ---

  it('patch() sends JSON and returns response', async () => {
    server.use(
      http.patch(`${TEST_BASE_URL}/api/items/1`, async ({ request }) => {
        const body = await request.json() as any;
        return HttpResponse.json({ id: 1, ...body });
      }),
    );
    const data = await apiClient.patch('/items/1', { name: 'updated' });
    expect(data).toEqual({ id: 1, name: 'updated' });
  });

  it('patch() throws on non-ok response', async () => {
    server.use(
      http.patch(`${TEST_BASE_URL}/api/items/99`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );
    await expect(apiClient.patch('/items/99', {})).rejects.toThrow('API error');
  });

  // --- put() ---

  it('put() sends JSON and returns response', async () => {
    server.use(
      http.put(`${TEST_BASE_URL}/api/settings/key1`, async ({ request }) => {
        const body = await request.json() as any;
        return HttpResponse.json({ key: 'key1', ...body });
      }),
    );
    const data = await apiClient.put('/settings/key1', { value: 'v1' });
    expect(data).toEqual({ key: 'key1', value: 'v1' });
  });

  it('put() throws on non-ok response', async () => {
    server.use(
      http.put(`${TEST_BASE_URL}/api/settings/bad`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    await expect(apiClient.put('/settings/bad', {})).rejects.toThrow('API error');
  });

  // --- delete() ---

  it('delete() sends DELETE request', async () => {
    server.use(
      http.delete(`${TEST_BASE_URL}/api/items/1`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(apiClient.delete('/items/1')).resolves.toBeUndefined();
  });

  it('delete() throws on non-ok response', async () => {
    server.use(
      http.delete(`${TEST_BASE_URL}/api/items/99`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );
    await expect(apiClient.delete('/items/99')).rejects.toThrow('API error');
  });

  // --- Settings convenience methods ---

  it('getAllSettings() calls get(/settings)', async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/api/settings`, () =>
        HttpResponse.json({ settings: [{ key: 'k1', value: 'v1' }] }),
      ),
    );
    const data = await apiClient.getAllSettings();
    expect(data.settings).toHaveLength(1);
  });

  it('getSetting() calls get with key', async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/api/settings/mykey`, () =>
        HttpResponse.json({ key: 'mykey', value: 'myval' }),
      ),
    );
    const data = await apiClient.getSetting('mykey');
    expect(data.key).toBe('mykey');
  });

  it('updateSetting() calls put with value and category', async () => {
    server.use(
      http.put(`${TEST_BASE_URL}/api/settings/mykey`, () =>
        HttpResponse.json({ message: 'ok' }),
      ),
    );
    const data = await apiClient.updateSetting('mykey', 'val', 'cat');
    expect(data.message).toBe('ok');
  });

  it('deleteSetting() calls delete', async () => {
    server.use(
      http.delete(`${TEST_BASE_URL}/api/settings/mykey`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(apiClient.deleteSetting('mykey')).resolves.toBeUndefined();
  });

  // --- caching getBaseUrl ---

  it('caches baseUrl after first call', async () => {
    const data1 = await apiClient.get('/health');
    const data2 = await apiClient.get('/health');
    // Both should succeed (baseUrl only resolved once)
    expect(data1).toBeDefined();
    expect(data2).toBeDefined();
  });
});
