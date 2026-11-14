# Sotto (VexoHacks)

Control a swarm of AI coding agents with a whisper, a nod and a wrist tap. No keyboard.

Built on [Clicky](https://github.com/farzaa/clicky) (MIT, fork base). Everything in `server/`, `web/`, `bridge/` and `motion/` was written at VexoHacks, after 9:00 AM Nov 14 2026.

- `server/server.mjs`: Gemini 4 splits a task into parallel agents. Each can request a Stripe (test mode) spend or a PR merge. ElevenLabs speaks the request.
- `web/index.html`: the glasses view (XREAL): agents, progress, blast radius, budget, Stripe ledger.
- `bridge/band.py`: Vexo band 4 over BLE. Double-tap approves, wrist flick rejects.
- `motion/airpods.swift`: AirPods head nod approves, head shake rejects.

Run: `node server/server.mjs`, open http://127.0.0.1:8787, then `python3 bridge/band.py 4` and `./motion/airpods`.
Keys in `~/.vexohacks.env`: GEMINI_API_KEY, STRIPE_SECRET_KEY (test), ELEVENLABS_API_KEY.
