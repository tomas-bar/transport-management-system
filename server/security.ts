import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';

const settings = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, settings, (error, key) => error ? reject(error) : resolve(key));
});
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(run: () => Promise<T>): Promise<T> {
  if (running >= 2) {
    if (waiting.length >= 8) throw new Error('Prisijungimo paslauga užimta. Bandykite vėliau.');
    await new Promise<void>(resolve => waiting.push(resolve));
  } else running++;
  try { return await run(); } finally {
    const next = waiting.shift();
    if (next) next(); else running--;
  }
}
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validatePassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || [...value].length < 8 || Buffer.byteLength(value) > 1024) throw new Error('Slaptažodis turi būti bent 8 simbolių ir ne ilgesnis kaip 1024 baitų.');
}
export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await limited(() => derive(password, salt));
  return `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: unknown, encoded: string) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false;
  const [algorithm, n, r, p, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '131072' || r !== '8' || p !== '1' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) return false;
  const key = await limited(() => derive(password, salt));
  return equalSecret(key.toString('hex'), expected);
}
