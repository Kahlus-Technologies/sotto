import { hashPassword } from './crypto.js';
const users = { ada: { name: 'ada', hash: hashPassword('lovelace') } };
export function getUser(n) { return users[n] || null; }
