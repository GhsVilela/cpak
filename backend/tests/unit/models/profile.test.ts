import { describe, it, expect, vi } from 'vitest';

const { decryptMock, isEncryptedMock, encryptMock } = vi.hoisted(() => ({
  decryptMock: vi.fn((val: string) => val.replace('enc_', 'dec_')),
  isEncryptedMock: vi.fn((val: string) => val.startsWith('enc_')),
  encryptMock: vi.fn((val: string) => `enc_${val}`),
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  decrypt: decryptMock,
  isEncrypted: isEncryptedMock,
  encrypt: encryptMock,
}));

vi.mock('mongoose', () => {
  const methods: Record<string, (...args: any[]) => any> = {};
  const preSave: ((...args: any[]) => void)[] = [];
  const fakeSchema = {
    methods,
    index: vi.fn(),
    pre: vi.fn((_event: string, fn: (...args: any[]) => void) => preSave.push(fn)),
    method: vi.fn(),
    static: vi.fn(),
  };
  function Schema() { return fakeSchema; }
  Schema.Types = { Mixed: 'Mixed' };
  const model = vi.fn(() => ({}));
  (model as any).__schema = fakeSchema;
  (model as any).__preSave = preSave;
  return {
    default: { model, Schema },
    Schema,
    model,
  };
});

// Import after mocks so the profile module registers methods on the fake schema
import '../../../src/models/profile.js';
import mongoose from 'mongoose';

describe('Profile model: getDecryptedCredentials', () => {
  // The getDecryptedCredentials method was registered on the schema's methods object
  const schema = (mongoose.model as any).__schema;
  const methods = schema.methods;

  it('decrypts steamApiKey when isEncrypted returns true', () => {
    const context = {
      credentials: {
        steamApiKey: 'enc_my-api-key',
        accessToken: undefined,
        refreshToken: undefined,
      },
    };
    const result = methods.getDecryptedCredentials.call(context);
    expect(decryptMock).toHaveBeenCalledWith('enc_my-api-key');
    expect(result.steamApiKey).toBe('dec_my-api-key');
  });

  it('decrypts accessToken when isEncrypted returns true', () => {
    const context = {
      credentials: {
        accessToken: 'enc_access-tok',
      },
    };
    const result = methods.getDecryptedCredentials.call(context);
    expect(decryptMock).toHaveBeenCalledWith('enc_access-tok');
    expect(result.accessToken).toBe('dec_access-tok');
  });

  it('decrypts refreshToken when isEncrypted returns true', () => {
    const context = {
      credentials: {
        refreshToken: 'enc_refresh-tok',
      },
    };
    const result = methods.getDecryptedCredentials.call(context);
    expect(decryptMock).toHaveBeenCalledWith('enc_refresh-tok');
    expect(result.refreshToken).toBe('dec_refresh-tok');
  });

  it('handles decrypt failure gracefully (catch block)', () => {
    decryptMock.mockImplementationOnce(() => { throw new Error('decrypt failed'); });
    const context = {
      credentials: {
        steamApiKey: 'enc_broken',
      },
    };
    // Should not throw — catch block logs and returns
    const result = methods.getDecryptedCredentials.call(context);
    expect(result).toBeDefined();
  });

  it('does not decrypt when values are not encrypted', () => {
    const context = {
      credentials: {
        steamApiKey: 'plain-key',
        accessToken: 'plain-token',
        refreshToken: 'plain-refresh',
      },
    };
    decryptMock.mockClear();
    methods.getDecryptedCredentials.call(context);
    expect(decryptMock).not.toHaveBeenCalled();
  });
});

describe('Profile model: pre-save encryption hook', () => {
  const preSave = (mongoose.model as any).__preSave;

  it('encrypts steamApiKey on new documents', () => {
    encryptMock.mockClear();
    const context = {
      isNew: true,
      isModified: vi.fn(() => false),
      credentials: { steamApiKey: 'my-api-key' },
    };
    const next = vi.fn();
    preSave[0].call(context, next);
    expect(encryptMock).toHaveBeenCalledWith('my-api-key');
    expect(next).toHaveBeenCalled();
  });

  it('encrypts accessToken and refreshToken when credentials are modified', () => {
    encryptMock.mockClear();
    const context = {
      isNew: false,
      isModified: vi.fn((field: string) => field === 'credentials'),
      credentials: { accessToken: 'tok', refreshToken: 'ref' },
    };
    const next = vi.fn();
    preSave[0].call(context, next);
    expect(encryptMock).toHaveBeenCalledWith('tok');
    expect(encryptMock).toHaveBeenCalledWith('ref');
    expect(next).toHaveBeenCalled();
  });

  it('skips encryption when values are already encrypted', () => {
    encryptMock.mockClear();
    const context = {
      isNew: true,
      isModified: vi.fn(() => false),
      credentials: { steamApiKey: 'enc_already', accessToken: 'enc_done' },
    };
    const next = vi.fn();
    preSave[0].call(context, next);
    expect(encryptMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('skips encryption when credentials are not modified', () => {
    encryptMock.mockClear();
    const context = {
      isNew: false,
      isModified: vi.fn(() => false),
      credentials: { steamApiKey: 'key' },
    };
    const next = vi.fn();
    preSave[0].call(context, next);
    expect(encryptMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('calls next even when no credentials exist', () => {
    const context = {
      isNew: true,
      isModified: vi.fn(() => false),
      credentials: null,
    };
    const next = vi.fn();
    preSave[0].call(context, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('Profile model: toJSON', () => {
  const schema = (mongoose.model as any).__schema;
  const methods = schema.methods;

  it('masks credentials in JSON output', () => {
    const context = {
      toObject: () => ({
        _id: '123',
        platform: 'steam',
        displayName: 'Test',
        credentials: {
          steamApiKey: 'enc_secret',
          tokenType: 'Bearer',
          expiresAt: new Date('2025-01-01'),
          scopes: ['read'],
        },
      }),
    };
    const result = methods.toJSON.call(context);
    expect(result.credentials.configured).toBe(true);
    expect(result.credentials.steamApiKeyConfigured).toBe(true);
    expect(result.credentials.tokenType).toBe('Bearer');
    expect(result.credentials.scopes).toEqual(['read']);
    // Should NOT expose the raw key
    expect(result.credentials.steamApiKey).toBeUndefined();
    expect(result.credentials.accessToken).toBeUndefined();
    expect(result.credentials.refreshToken).toBeUndefined();
  });

  it('reports steamApiKeyConfigured as false when no key', () => {
    const context = {
      toObject: () => ({
        _id: '456',
        platform: 'xbox',
        displayName: 'XboxUser',
        credentials: {
          accessToken: 'enc_token',
        },
      }),
    };
    const result = methods.toJSON.call(context);
    expect(result.credentials.configured).toBe(true);
    expect(result.credentials.steamApiKeyConfigured).toBe(false);
  });
});
