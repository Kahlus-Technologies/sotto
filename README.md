# Sotto

**Run a swarm of AI coding agents with a whisper, a head nod and a wrist tap. No keyboard, no screen in your hands.**

Sotto is a VexoHacks 2026 project. You wear AirPods and a Vexo band, and the swarm shows up on XREAL glasses.
Say a task. Gemini 4 splits it across parallel coding agents. Each agent works in its own git branch, runs the tests,
and measures its own **blast radius** (files changed plus everything that imports them, plus a penalty for failing tests).
When an agent wants to spend money or merge, the glasses show it, ElevenLabs reads it to you, and you answer with your body:

| Gesture | Device | Meaning |
|---|---|---|
| Head nod | AirPods (`motion/airpods.swift`) | approve |
| Head shake | AirPods | reject |
| Double-tap | Vexo band 4 (`bridge/band.py`) | approve |
| Wrist flick | Vexo band | reject |

The band light mirrors the swarm: blue working, amber blinking when it needs you, red blinking when the pending merge is risky, green when done.

## Tracks
- **Gemini 4**: plans the swarm and writes every patch (`server/server.mjs`).
- **Stripe, Best Economic Agent**: agents that must buy a paid API ask for budget. Approval creates a real Stripe test-mode PaymentIntent and shows it in the ledger.
- **ElevenLabs**: spoken approval requests.
- **Hardware**: AirPods Pro head motion, Vexo band (BLE contract from `vexo-open-kit`), XREAL display.

## Run it
```
node server/server.mjs                 # http://127.0.0.1:8787  (put the page on the glasses)
python3 bridge/band.py 4               # your own band number only; double-tap the band first
open motion/Sotto.app                  # AirPods nod/shake
```
Keys are read from `~/.vexohacks.env`: `GEMINI_API_KEY`, `STRIPE_SECRET_KEY` (test mode only), `ELEVENLABS_API_KEY`.
Hold SPACE on the page and speak a task, or type one. The demo target repo is `demo-target/`; each run copies it to `/tmp`.

## Honest notes
- Built from scratch after the 9:00 AM start. Base fork: [Clicky](https://github.com/farzaa/clicky) (MIT), which we did not build on; the original macOS app is untouched.
- Stripe is test mode only. No real money moves.
- Our earlier research (Subvox) decodes silent words from AirPods head motion at about 42% on 5 words. That is too weak to demo live, so Sotto uses nods and taps, which work reliably.
