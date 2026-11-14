// Sotto server: Gemini plans a swarm of agents, Stripe (test mode) holds budgets,
// ElevenLabs speaks requests, gestures (nod/shake, band tap/flick) approve or reject.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
for (const l of (fs.existsSync(env.HOME + '/.vexohacks.env') ? fs.readFileSync(env.HOME + '/.vexohacks.env', 'utf8') : '').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !env[m[1]]) env[m[1]] = m[2];
}
const PORT = +env.PORT || 8787;
const GEMINI = env.GEMINI_MODEL || 'gemini-4-hydrogen';
const clients = new Set();
const state = { task: '', agents: [], pending: null, queue: [], ledger: [], budget: 50 };

const push = () => { const s = 'data: ' + JSON.stringify(state) + '\n\n'; for (const c of clients) c.write(s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gemini(prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(25000) });
  const j = await r.json();
  return JSON.parse(j.candidates[0].content.parts[0].text);
}

const FALLBACK = t => [
  { name: 'Fixer', goal: 'Patch the bug: ' + t, files: ['auth/login.ts', 'auth/session.ts'], blast: 25, spend: null },
  { name: 'Scout', goal: 'Buy an OCR API key to parse receipts', files: ['ocr/client.ts'], blast: 10, spend: { item: 'OCR API credits', usd: 4 } },
  { name: 'Refactor', goal: 'Rewrite the database layer', files: ['db/*.ts', 'migrations/*'], blast: 88, spend: null },
];

async function plan(task) {
  try {
    const out = await gemini(`You split a developer task into 3 parallel coding agents. Task: "${task}".
Return JSON array of 3 objects: {name (one word), goal (short), files (2-3 plausible paths), blast (0-100 estimated blast radius, how much code could break), spend (null or {item, usd integer 1-9} if the agent must buy an API or service)}. At least one agent has spend, at least one has blast over 75.`);
    if (Array.isArray(out) && out.length) return out.slice(0, 4);
  } catch (e) { console.log('gemini failed, fallback:', e.message); }
  return FALLBACK(task);
}

async function stripeCharge(a) {
  if (!env.STRIPE_SECRET_KEY?.includes('_test_')) return { id: 'skipped' };
  const body = new URLSearchParams({ amount: String(a.spend.usd * 100), currency: 'usd', payment_method: 'pm_card_visa', confirm: 'true',
    description: `Sotto agent ${a.name}: ${a.spend.item}`, 'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never' });
  const r = await fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', body, headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY } });
  const j = await r.json();
  return { id: j.id || 'error', status: j.status, error: j.error?.message };
}

function ask(a) {
  const req = a.spend
    ? { agent: a.name, kind: 'spend', text: `${a.name} wants to spend ${a.spend.usd} dollars on ${a.spend.item}. Nod to approve.` }
    : { agent: a.name, kind: 'merge', text: `${a.name} wants to merge a pull request touching ${a.files.length} files. Blast radius ${a.blast} percent. ${a.blast > 75 ? 'Risky. ' : ''}Nod to merge, shake to stop.` };
  a.status = 'waiting';
  state.queue.push(req); next(); push();
}
function next() { if (!state.pending && state.queue.length) { state.pending = state.queue.shift(); state.pending.at = Date.now(); } }

async function runAgent(a) {
  for (let p = 0; p <= 100; p += 20) { a.progress = p; push(); await sleep(700 + Math.random() * 900); }
  ask(a);
}

async function decide(approve, source) {
  const req = state.pending; if (!req) return;
  const a = state.agents.find(x => x.name === req.agent);
  state.pending = null;
  if (approve) {
    if (req.kind === 'spend') {
      const c = await stripeCharge(a); state.budget -= a.spend.usd;
      state.ledger.unshift({ agent: a.name, usd: a.spend.usd, item: a.spend.item, stripe: c.id, status: c.status || c.error });
    }
    a.status = 'merged'; a.pr = `PR #${100 + state.agents.indexOf(a)}`;
  } else a.status = 'stopped';
  a.decidedBy = source; next(); push();
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const body = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('access-control-allow-origin', '*');
  if (u.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    clients.add(res); res.write('data: ' + JSON.stringify(state) + '\n\n'); req.on('close', () => clients.delete(res)); return;
  }
  if (u.pathname === '/task' && req.method === 'POST') {
    const { text } = await body(req); if (!text) return res.end('{}');
    Object.assign(state, { task: text, agents: [], pending: null, queue: [], ledger: [], budget: 50 });
    push();
    const agents = (await plan(text)).map(a => ({ ...a, status: 'working', progress: 0 }));
    state.agents = agents; push(); agents.forEach(runAgent);
    return res.end(JSON.stringify({ ok: true }));
  }
  if (u.pathname === '/gesture' && req.method === 'POST') {
    const { type, source } = await body(req);
    await decide(['approve', 'nod', 'tap2'].includes(type), source || type); return res.end('{}');
  }
  if (u.pathname === '/tts') {
    const t = u.searchParams.get('text') || '';
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb', { method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text: t, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.6, style: 0 } }) });
    res.writeHead(r.status, { 'content-type': 'audio/mpeg' }); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const f = path.join(here, '../web', u.pathname === '/' ? 'index.html' : u.pathname);
  if (f.startsWith(path.join(here, '../web')) && fs.existsSync(f)) { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404).end();
}).listen(PORT, '127.0.0.1', () => console.log('sotto on http://127.0.0.1:' + PORT));
