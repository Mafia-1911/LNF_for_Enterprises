import { describe, expect, it } from 'vitest';
import { createPrivateDetailsCrypto } from './index';

const k1 = Buffer.alloc(32, 1);
const k2 = Buffer.alloc(32, 2);

describe('private details encryption (AES-256-GCM)', () => {
  const crypto = createPrivateDetailsCrypto(
    new Map([
      [1, k1],
      [2, k2],
    ]),
    2,
  );

  it('round-trips with the active key version', () => {
    const e = crypto.encrypt('Name tag inside the front pocket', 't:lost_report:LST-1');
    expect(e.keyVersion).toBe(2);
    expect(e.ciphertext).not.toContain('Name tag');
    expect(crypto.decrypt(e, 't:lost_report:LST-1')).toBe('Name tag inside the front pocket');
  });

  it('uses a fresh IV every time', () => {
    expect(crypto.encrypt('same', 'aad').ciphertext).not.toBe(
      crypto.encrypt('same', 'aad').ciphertext,
    );
  });

  it('refuses to decrypt when moved to another record (AAD mismatch)', () => {
    const e = crypto.encrypt('secret', 't:lost_report:LST-1');
    expect(() => crypto.decrypt(e, 't:lost_report:LST-2')).toThrow();
  });

  it('detects tampering', () => {
    const e = crypto.encrypt('secret', 'aad');
    const raw = Buffer.from(e.ciphertext, 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    expect(() => crypto.decrypt({ ...e, ciphertext: raw.toString('base64') }, 'aad')).toThrow();
  });

  it('still decrypts rows written with an older key version', () => {
    const old = createPrivateDetailsCrypto(new Map([[1, k1]]), 1).encrypt('old row', 'aad');
    expect(crypto.decrypt(old, 'aad')).toBe('old row');
  });

  it('fails clearly for an unknown key version', () => {
    expect(() => crypto.decrypt({ ciphertext: 'AAAA', keyVersion: 9 }, 'aad')).toThrow(
      'No 32-byte key for version 9.',
    );
    expect(() => createPrivateDetailsCrypto(new Map(), 1).encrypt('x', 'aad')).toThrow(
      'No 32-byte key for version 1.',
    );
  });
});
