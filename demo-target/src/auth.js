import { hashPassword } from './crypto.js';
import { getUser } from './db.js';
export function login(name, password) {
  const u = getUser(name);
  if (!u) return { ok: false, error: 'no such user' };
  // BUG: compares the plain password to the stored hash
  if (u.hash === password) return { ok: true, token: 't_' + name };
  return { ok: false, error: 'bad password' };
}
