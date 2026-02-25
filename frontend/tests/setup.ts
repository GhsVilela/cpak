import '@testing-library/jest-dom';
import { server } from './mocks/handlers';

// Inject the config before each test so config.ts's getConfig() reads from
// window.__CONFIG__ instead of fetching /config.json (which happy-dom would
// attempt as http://localhost:3000/config.json, bypassing MSW entirely).
beforeEach(() => {
  (globalThis as any).__CONFIG__ = { API_BASE_URL: 'http://localhost/api' };
  if (typeof window !== 'undefined') {
    (window as any).__CONFIG__ = { API_BASE_URL: 'http://localhost/api' };
  }
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
