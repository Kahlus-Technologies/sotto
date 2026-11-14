import { login } from './auth.js';
import { ocr } from './ocr.js';
export const routes = { '/login': (b) => login(b.name, b.password), '/ocr': (b) => ({ text: ocr(b.image) }) };
