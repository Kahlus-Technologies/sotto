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

## Which model does what (live in the UI, switchable)
| Role | Default | Can switch to |
|---|---|---|
| Planner (splits the task) | Gemini 4 hydrogen | MiniMax M3.1 Flash, M3 |
| Coder agents (write patches) | Gemini 4 hydrogen | MiniMax M3.1 Flash, M3 |
| Silent words to task | MiniMax M3.1 Flash | Gemini, MiniMax M3 |
| Voice out | MiniMax speech-2.8-turbo | ElevenLabs flash v2.5 (fallback) |
| Voice in | MiniMax asr-1.0 (hold-to-talk in the Subvox app) | Deepgram Nova-3 (also live via Pipecat `voice/voice.py`) |

The right panel of the page shows the active model per role and a live call count and average latency per model. A failed MiniMax call falls back to Gemini and is counted as a fallback.

## Tracks
- **Gemini 4**: plans the swarm and writes every patch (`server/server.mjs`).
- **Stripe, Best Economic Agent**: agents that must buy a paid API ask for budget. Approval creates a real Stripe test-mode PaymentIntent and shows it in the ledger.
- **Deepgram + Pipecat** (`voice/voice.py`): the whole voice loop is a Pipecat pipeline. Mic, Silero VAD, Deepgram Nova-3 streaming STT, an intent router ("Sotto, fix the login bug", then "yes" or "stop"), and ElevenLabs TTS reading each request back.
- **MiniMax**: M3.1 turns silent words decoded by the Subvox app into a task; MiniMax speech reads requests aloud. ElevenLabs is the fallback voice.
- **ElevenLabs**: spoken approval requests (streamed through Pipecat).
- **Hardware**: AirPods Pro head motion, Vexo band (BLE contract from `vexo-open-kit`), XREAL display.

## Run it
```
node server/server.mjs                 # http://127.0.0.1:8787  (put the page on the glasses)
python3 bridge/band.py 4               # your own band number only; double-tap the band first
open motion/Sotto.app                  # AirPods nod/shake
python3 -m venv .venv && .venv/bin/pip install 'pipecat-ai[deepgram,elevenlabs,silero,local]'
.venv/bin/python voice/voice.py        # say: "Sotto, fix the login bug"
```
Keys are read from `~/.vexohacks.env`: `GEMINI_API_KEY`, `STRIPE_SECRET_KEY` (test mode only), `ELEVENLABS_API_KEY`.
Hold SPACE on the page and speak a task, or type one. The demo target repo is `demo-target/`; each run copies it to `/tmp`.

## Honest notes
- Built from scratch after the 9:00 AM start. Base fork: [Clicky](https://github.com/farzaa/clicky) (MIT), which we did not build on; the original macOS app is untouched.
- Stripe is test mode only. No real money moves.
- Our earlier research (Subvox) decodes silent words from AirPods head motion at about 42% on 5 words. That is too weak to demo live, so Sotto uses nods and taps, which work reliably.
