import test from 'node:test'; import assert from 'node:assert';
import { login } from '../src/auth.js';
test('right password logs in', () => assert.equal(login('ada', 'lovelace').ok, true));
test('wrong password fails', () => assert.equal(login('ada', 'nope').ok, false));
