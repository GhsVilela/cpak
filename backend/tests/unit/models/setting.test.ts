import { describe, it, expect, vi } from 'vitest';

const { decryptMock, encryptMock } = vi.hoisted(() => ({
  decryptMock: vi.fn((val: string) => `decrypted_${val}`),
  encryptMock: vi.fn((val: string) => `encrypted_${val}`),
}));

vi.mock('../../../src/utils/crypto.js', () => ({
  decrypt: decryptMock,
  encrypt: encryptMock,
}));

vi.mock('mongoose', () => {
  const instanceMethods: Record<string, (...args: any[]) => any> = {};
  const staticMethods: Record<string, (...args: any[]) => any> = {};
  const fakeSchema = {
    index: vi.fn(),
    method: vi.fn((name: string, fn: any) => { instanceMethods[name] = fn; }),
    static: vi.fn((name: string, fn: any) => { staticMethods[name] = fn; }),
  };
  const modelFn = vi.fn(() => ({}));
  (modelFn as any).__schema = fakeSchema;
  (modelFn as any).__instanceMethods = instanceMethods;
  (modelFn as any).__staticMethods = staticMethods;
  return {
    Schema: function Schema() { return fakeSchema; },
    model: modelFn,
  };
});

import '../../../src/models/setting.js';
import { model } from 'mongoose';

describe('Setting model methods', () => {
  const instanceMethods = (model as any).__instanceMethods;
  const staticMethods = (model as any).__staticMethods;

  it('getDecryptedValue returns plain value when not secret', () => {
    const context = { isSecret: false, value: 'plain-val', key: 'test_key' };
    const result = instanceMethods.getDecryptedValue.call(context);
    expect(result).toBe('plain-val');
  });

  it('getDecryptedValue decrypts value when secret', () => {
    const context = { isSecret: true, value: 'enc-val', key: 'test_key' };
    const result = instanceMethods.getDecryptedValue.call(context);
    expect(decryptMock).toHaveBeenCalledWith('enc-val');
    expect(result).toBe('decrypted_enc-val');
  });

  it('getDecryptedValue throws when decrypt fails', () => {
    decryptMock.mockImplementationOnce(() => { throw new Error('bad key'); });
    const context = { isSecret: true, value: 'bad-enc', key: 'my_setting' };
    expect(() => instanceMethods.getDecryptedValue.call(context)).toThrow(
      'Failed to decrypt setting my_setting',
    );
  });

  it('encryptValue encrypts the value', () => {
    const result = staticMethods.encryptValue('my-secret');
    expect(encryptMock).toHaveBeenCalledWith('my-secret');
    expect(result).toBe('encrypted_my-secret');
  });
});
