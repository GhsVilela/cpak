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
