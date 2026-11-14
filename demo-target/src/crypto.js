export function hashPassword(p) { let h = 0; for (const c of p) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'h' + h; }
