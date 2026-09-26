import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return 'scrypt-v1:' + salt + ':' + (await derive(password, salt)).toString('hex');
}
export async function verifyPassword(password: string, stored?: string) {
  const parts = stored?.split(':');
  const valid = parts?.length === 3 && parts[0] === 'scrypt-v1' && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  // Unknown users still pay the same password-hashing cost.
  const key = await derive(password, valid ? parts[1] : '00000000000000000000000000000000');
  const expected = valid ? Buffer.from(parts[2], 'hex') : Buffer.alloc(64);
  return timingSafeEqual(key, expected) && Boolean(valid);
}
