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
const THINK = env.GEMINI_THINKING || 'low';
const clients = new Set();
const pose = { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 };
const state = { focus: 0, diffOpen: false, zoom: 1, task: '', agents: [], pending: null, queue: [], ledger: [], budget: 50 };

const push = () => { const s = 'data: ' + JSON.stringify(state) + '\n\n'; for (const c of clients) c.write(s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Model registry: every LLM/voice call is routed through here and counted, so the UI can show what runs where.
const MODELS = {
  'gemini-4-hydrogen': { vendor: 'Google DeepMind', kind: 'llm' },
  'MiniMax-M3.1-Flash': { vendor: 'MiniMax', kind: 'llm' },
  'MiniMax-M3': { vendor: 'MiniMax', kind: 'llm' },
};
state.models = { planner: GEMINI, coder: GEMINI, silent: env.MINIMAX_MODEL || 'MiniMax-M3.1-Flash',
  voice: env.MINIMAX_API_KEY ? 'MiniMax speech-2.8-turbo' : 'ElevenLabs flash v2.5', stt: 'MiniMax asr-1.0' };
state.options = ['gemini-4-hydrogen', 'MiniMax-M3.1-Flash', 'MiniMax-M3'];
state.voiceOptions = ['MiniMax speech-2.8-turbo', 'ElevenLabs flash v2.5'];
state.sttOptions = ['MiniMax asr-1.0', 'Deepgram Nova-3'];
state.calls = {}; state.last = {};
const count = (model, role, ms, ok) => { const c = (state.calls[model] ||= { n: 0, ms: 0, fail: 0 }); c.n++; c.ms += ms; if (!ok) c.fail++; state.last[role] = { model, ms: Math.round(ms), ok }; push(); };

async function minimax(prompt, model) {
  const r = await fetch(`${env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'}/text/chatcompletion_v2`, { method: 'POST',
    headers: { authorization: 'Bearer ' + env.MINIMAX_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 6000, messages: [{ role: 'user', content: prompt + '\nReturn only valid JSON, no markdown.' }] }),
    signal: AbortSignal.timeout(60000) });
  const txt = (await r.json()).choices?.[0]?.message?.content || '';
  return JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim());
}
async function geminiCall(prompt, model) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: THINK } } }),
    signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  return JSON.parse(j.candidates[0].content.parts[0].text);
}
// role = planner | coder. Uses the model chosen in the UI; falls back to Gemini if the chosen one fails.
async function gemini(prompt, role = 'coder') {
  const model = state.models[role], t0 = Date.now();
  try {
    const out = model.startsWith('MiniMax') ? await minimax(prompt, model) : await geminiCall(prompt, model);
    count(model, role, Date.now() - t0, true); return out;
  } catch (e) {
    count(model, role, Date.now() - t0, false);
    if (model.startsWith('MiniMax')) { const t1 = Date.now(); const out = await geminiCall(prompt, GEMINI); count(GEMINI + ' (fallback)', role, Date.now() - t1, true); return out; }
    throw e;
  }
}

import { execFileSync } from 'node:child_process';
const TEMPLATE = path.join(here, '../demo-target');
const TARGET = '/tmp/sotto-target';
const WT = '/tmp/sotto-wt';
const sh = (cwd, ...a) => { try { return execFileSync(a[0], a.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e.stdout || '') + (e.stderr || '') + '\nEXIT_FAIL'; } };
const srcFiles = dir => fs.readdirSync(path.join(dir, 'src')).map(f => 'src/' + f).concat(fs.readdirSync(path.join(dir, 'test')).map(f => 'test/' + f));
const readAll = dir => Object.fromEntries(srcFiles(dir).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

async function plan(task) {
  const code = readAll(TARGET);
  try {
    const out = await gemini(`You lead a swarm of 3 coding agents working on this small JS repo (ES modules). Task from the owner: "${task}".
Repo files:\n${Object.entries(code).map(([f, c]) => `--- ${f}\n${c}`).join('\n')}
Return a JSON array of exactly 3 agents: {name (one word), goal (one sentence), spend (null, or {item, usd (integer 1-9)} if the agent must buy a paid API/service before it can do its job)}.
Agent 1 fixes the actual bug. Agent 2 does the part of the task that needs a paid service (spend not null). Agent 3 does an ambitious but risky refactor of shared code (e.g. rewrite crypto/db layer) that touches many files.`, 'planner');
    if (Array.isArray(out) && out.length) return out.slice(0, 3);
  } catch (e) { console.log('plan failed, fallback:', e.message); }
  return [{ name: 'Fixer', goal: 'Fix the login bug', spend: null },
          { name: 'Scout', goal: 'Wire up an OCR API', spend: { item: 'OCR API credits', usd: 4 } },
          { name: 'Refactor', goal: 'Rewrite the crypto and db layer with a salted hash', spend: null }];
}

function depsOf(dir) { // file -> files that import it
  const g = {};
  for (const [f, c] of Object.entries(readAll(dir))) for (const m of c.matchAll(/from '\.\/([\w.-]+)'|from '\.\.\/src\/([\w.-]+)'/g)) { const t = 'src/' + (m[1] || m[2]); (g[t] ||= []).push(f); }
  return g;
}

function blast(dir, changed, testsPassed) {
  const g = depsOf(dir), seen = new Set(changed);
  const q = [...changed];
  while (q.length) for (const d of g[q.pop()] || []) if (!seen.has(d)) { seen.add(d); q.push(d); }
  const reach = seen.size - changed.length;
  const score = Math.min(100, 14 * changed.length + 10 * reach + (testsPassed ? 0 : 45));
  return { score, changed, reach };
}

async function work(a, i) {
  const dir = `${WT}/${a.name.toLowerCase()}`, branch = `sotto/${a.name.toLowerCase()}-${Date.now() % 100000}`;
  sh(TARGET, 'git', 'worktree', 'prune'); fs.rmSync(dir, { recursive: true, force: true });
  sh(TARGET, 'git', 'worktree', 'add', '-q', '-b', branch, dir, 'HEAD'); a.branch = branch; a.dir = dir;
  a.progress = 15; a.status = 'working'; push();
  if (a.spend) { a.status = 'waiting'; a.waitFor = 'spend'; ask(a); await new Promise(r => a.resume = r); if (a.status === 'stopped') return; a.status = 'working'; push(); }
  const code = readAll(dir);
  let edits = {};
  try {
    const out = await gemini(`You are coding agent "${a.name}". Goal: ${a.goal}. ${a.spend ? 'You have bought: ' + a.spend.item + '. Write a minimal working stub integration (no real network calls).' : ''}
Repo (ES modules, node --test):\n${Object.entries(code).map(([f, c]) => `--- ${f}\n${c}`).join('\n')}
Return JSON {"summary": one sentence, "files": {"path": "full new file content", ...}} containing only files you change or add under src/ or test/. Keep existing exports working.`, 'coder');
    edits = out.files || {}; a.summary = out.summary || '';
  } catch (e) { a.summary = 'agent failed: ' + e.message; }
  a.progress = 55; push();
  for (const [f, c] of Object.entries(edits)) { if (!/^(src|test)\/[\w.-]+\.js$/.test(f)) continue; fs.writeFileSync(path.join(dir, f), c); }
  const changed = sh(dir, 'git', 'status', '--porcelain').split('\n').filter(Boolean).map(l => l.slice(3).trim());
  const t = sh(dir, 'node', '--test', ...fs.readdirSync(path.join(dir, 'test')).map(f => 'test/' + f)); a.testsPassed = !/EXIT_FAIL|# fail [1-9]|ℹ fail [1-9]/.test(t) && !/not ok/.test(t);
  Object.assign(a, { blast: 0, files: changed }); const b = blast(dir, changed, a.testsPassed);
  a.blast = b.score; a.reach = b.reach; a.files = changed.length ? changed : ['(no change)'];
  a.diff = sh(dir, 'git', 'diff', 'HEAD', '--', 'src', 'test').slice(0, 1800);
  a.progress = 100; push();
  if (changed.length) { sh(dir, 'git', 'add', '-A'); sh(dir, 'git', '-c', 'user.email=s@s', '-c', 'user.name=sotto', 'commit', '-qm', `${a.name}: ${a.goal}`); }
  a.status = 'waiting'; a.waitFor = 'merge'; ask(a);
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
  const req = (a.spend && a.waitFor === 'spend')
    ? { agent: a.name, kind: 'spend', text: `${a.name} wants to spend ${a.spend.usd} dollars on ${a.spend.item}. Nod to approve.` }
    : { agent: a.name, kind: 'merge', text: `${a.name} wants to merge a pull request touching ${a.files.length} files. Tests ${a.testsPassed ? 'pass' : 'fail'}. Blast radius ${a.blast} percent. ${a.blast > 60 || !a.testsPassed ? 'Risky. ' : ''}Nod to merge, shake to stop.` };
  a.status = 'waiting';
  state.queue.push(req); next(); push();
}
function next() { if (!state.pending && state.queue.length) { state.pending = state.queue.shift(); state.pending.at = Date.now(); } }


async function decide(approve, source) {
  const req = state.pending; if (!req) return;
  const a = state.agents.find(x => x.name === req.agent);
  state.pending = null; a.decidedBy = source;
  if (req.kind === 'spend') {
    if (approve) { const c = await stripeCharge(a); state.budget -= a.spend.usd;
      state.ledger.unshift({ agent: a.name, usd: a.spend.usd, item: a.spend.item, stripe: c.id, status: c.status || c.error }); a.resume?.(); }
    else { a.status = 'stopped'; a.resume?.(); }
  } else if (approve) {
    const out = sh(TARGET, 'git', 'merge', '--no-edit', '-q', '-m', `Merge ${a.name}`, a.branch);
    a.status = /EXIT_FAIL|CONFLICT/.test(out) ? 'conflict' : 'merged'; if (a.status === 'conflict') sh(TARGET, 'git', 'merge', '--abort');
    a.pr = a.branch;
  } else a.status = 'stopped';
  next(); push();
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
  if (u.pathname === '/state') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ pending: !!state.pending, kind: state.pending?.kind, risky: state.pending && state.agents.find(a => a.name === state.pending.agent)?.blast > 60, working: state.agents.some(a => a.status === 'working'), last: state.agents.map(a => a.status) })); }
  if (u.pathname === '/speak') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ text: state.pending?.text || '' })); }
  if (u.pathname === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ models: state.models, options: state.options, voiceOptions: state.voiceOptions, sttOptions: state.sttOptions, calls: state.calls, last: state.last, heard: state.heard || null, task: state.task, pending: state.pending?.text || null, agents: state.agents.map(a => ({ name: a.name, status: a.status, blast: a.blast })) })); }
  // Hold-to-talk from the Subvox app: WAV in, MiniMax ASR (or Deepgram) -> text -> swarm task.
  if (u.pathname === '/listen' && req.method === 'POST') {
    const chunks = []; for await (const c of req) chunks.push(c); const wav = Buffer.concat(chunks);
    const t0 = Date.now(); let text = '', model = state.models.stt;
    try {
      if (model.startsWith('MiniMax')) {
        const fd = new FormData(); fd.append('model', 'asr-1.0'); fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'a.wav');
        const r = await fetch('https://api.minimax.io/v1/speech_to_text', { method: 'POST', headers: { authorization: 'Bearer ' + env.MINIMAX_API_KEY }, body: fd });
        text = ((await r.json()).text || '').trim();
      } else {
        const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', { method: 'POST', headers: { authorization: 'Token ' + env.DEEPGRAM_API_KEY, 'content-type': 'audio/wav' }, body: wav });
        text = (await r.json()).results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';
      }
      count(model, 'stt', Date.now() - t0, !!text);
    } catch (e) { count(model, 'stt', Date.now() - t0, false); }
    const task = text.replace(/^\W*(hey\s+)?(sotto|soto|so\s+to|sato)\b[\s,:.-]*/i, '').trim();
    state.heard = { raw: text, text: task || text, via: model }; push();
    if (task.length > 3) fetch(`http://127.0.0.1:${PORT}/task`, { method: 'POST', body: JSON.stringify({ text: task }) });
    return res.end(JSON.stringify({ text, task }));
  }
  if (u.pathname === '/model' && req.method === 'POST') { const { role, model } = await body(req); if ((role === 'stt' && state.sttOptions.includes(model)) || (['planner', 'coder', 'silent'].includes(role) && state.options.includes(model)) || (role === 'voice' && state.voiceOptions.includes(model))) { state.models[role] = model; push(); } return res.end('{}'); }
  if (u.pathname === '/task' && req.method === 'POST') {
    const { text } = await body(req); if (!text) return res.end('{}');
    Object.assign(state, { task: text, agents: [], pending: null, queue: [], ledger: [], budget: 50 });
    push();
    fs.rmSync(TARGET, { recursive: true, force: true }); fs.rmSync(WT, { recursive: true, force: true }); fs.cpSync(TEMPLATE, TARGET, { recursive: true });
    sh(TARGET, 'git', 'init', '-q', '-b', 'main'); sh(TARGET, 'git', 'add', '-A'); sh(TARGET, 'git', '-c', 'user.email=s@s', '-c', 'user.name=sotto', 'commit', '-qm', 'base');
    const agents = (await plan(text)).map(a => ({ ...a, status: 'working', progress: 5, blast: 0, files: [] }));
    state.agents = agents; push(); agents.forEach(work);
    return res.end(JSON.stringify({ ok: true }));
  }
  if (u.pathname === '/pose' && req.method === 'POST') { Object.assign(pose, await body(req)); for (const c of clients) c.write('event: pose\ndata: ' + JSON.stringify(pose) + '\n\n'); return res.end('{}'); }
  if (u.pathname === '/gesture' && req.method === 'POST') {
    const { type, source } = await body(req);
    const n = state.agents.length;
    if (type === 'tilt_right' && n) { state.focus = (state.focus + 1) % n; push(); return res.end('{}'); }
    if (type === 'tilt_left' && n) { state.focus = (state.focus + n - 1) % n; push(); return res.end('{}'); }
    if (type === 'look_up') { state.diffOpen = !state.diffOpen; push(); return res.end('{}'); }
    if (type === 'lean_in') { state.zoom = Math.min(1.6, state.zoom + 0.3); push(); return res.end('{}'); }
    if (type === 'lean_back') { state.zoom = Math.max(0.8, state.zoom - 0.3); push(); return res.end('{}'); }
    await decide(['approve', 'nod', 'tap2'].includes(type), source || type); return res.end('{}');
  }
  if (u.pathname === '/tts') {
    const t = u.searchParams.get('text') || '';
    const eleven = state.models.voice.startsWith('Eleven') || !env.MINIMAX_API_KEY;
    const tt0 = Date.now();
    if (!eleven) {
      try {
        const r = await fetch(`https://api.minimax.io/v1/t2a_v2?GroupId=${env.MINIMAX_GROUP_ID}`, { method: 'POST',
          headers: { authorization: 'Bearer ' + env.MINIMAX_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'speech-2.8-turbo', text: t, stream: false, voice_setting: { voice_id: 'English_expressive_narrator', speed: 1.08, vol: 1 }, audio_setting: { sample_rate: 32000, format: 'mp3' } }) });
        const j = await r.json();
        count('MiniMax speech-2.8-turbo', 'voice', Date.now() - tt0, !!j.data?.audio);
        if (j.data?.audio) { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(Buffer.from(j.data.audio, 'hex')); }
      } catch (e) { console.log('minimax tts failed', e.message); }
    }
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb', { method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text: t, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.6, style: 0 } }) });
    res.writeHead(r.status, { 'content-type': 'audio/mpeg' }); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  // Silent words from the Subvox decoder: MiniMax turns a few decoded words into one clear task sentence.
  if (u.pathname === '/silent' && req.method === 'POST') {
    const { words } = await body(req);
    const raw = (words || []).join(' ');
    let text = raw; const ts0 = Date.now();
    try {
      const r = await fetch(`${env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'}/text/chatcompletion_v2`, { method: 'POST',
        headers: { authorization: 'Bearer ' + env.MINIMAX_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ model: state.models.silent, max_tokens: 60, messages: [{ role: 'user', content:
          `A silent-speech decoder produced these words from head motion: "${raw}". Write the one short coding task the user most likely meant, imperative, under 12 words. Output only the task.` }] }) });
      text = (await r.json()).choices?.[0]?.message?.content?.trim() || raw;
      count(state.models.silent, 'silent', Date.now() - ts0, true);
    } catch { count(state.models.silent, 'silent', Date.now() - ts0, false); }
    state.heard = { raw, text }; push();
    if (text) { Object.assign(state, { task: text }); fetch(`http://127.0.0.1:${PORT}/task`, { method: 'POST', body: JSON.stringify({ text }) }); }
    return res.end(JSON.stringify({ text }));
  }
  const f = path.join(here, '../web', u.pathname === '/' ? 'index.html' : u.pathname);
  if (f.startsWith(path.join(here, '../web')) && fs.existsSync(f)) { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404).end();
}).listen(PORT, '127.0.0.1', () => console.log('sotto on http://127.0.0.1:' + PORT));
