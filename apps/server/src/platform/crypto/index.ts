// AES-256-GCM for private details (plan §7). Each value is bound to its tenant and record through
// the additional authenticated data, so a ciphertext copied to another row fails to decrypt.
// Stored format: base64(iv[12] | tag[16] | ciphertext) plus the key version used.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type Encrypted = { ciphertext: string; keyVersion: number };

export type PrivateDetailsCrypto = {
  encrypt(plaintext: string, aad: string): Encrypted;
  decrypt(value: Encrypted, aad: string): string;
};

export function createPrivateDetailsCrypto(
  keys: ReadonlyMap<number, Buffer>,
  activeVersion: number,
): PrivateDetailsCrypto {
  const keyFor = (version: number) => {
    const key = keys.get(version);
    if (!key || key.length !== 32) throw new Error(`No 32-byte key for version ${version}.`);
    return key;
  };
  return {
    encrypt(plaintext, aad) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyFor(activeVersion), iv);
      cipher.setAAD(Buffer.from(aad, 'utf8'));
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return {
        ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'),
        keyVersion: activeVersion,
      };
    },
    decrypt({ ciphertext, keyVersion }, aad) {
      const raw = Buffer.from(ciphertext, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', keyFor(keyVersion), raw.subarray(0, 12));
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}
