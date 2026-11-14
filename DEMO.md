# Sotto demo script (90 seconds)

Setup: server running, Subvox app open (AirPods in), Vexo band 4 connected, page on the glasses.

1. **Silent task (MiniMax).** Mouth "fix login bug" with no sound. Subvox decodes the words from AirPods head motion, MiniMax M3.1 turns them into one task, the swarm starts. Fallback: say "Sotto, fix the login bug" (Deepgram via Pipecat) or type it.
2. **Three agents work** in separate git branches (Gemini 4). The glasses show progress and each agent's blast radius.
3. **Agent asks to spend $5** on an OCR API. A MiniMax voice reads the request. Nod, or double-tap the Vexo band. A Stripe test-mode charge appears in the ledger.
4. **Risky merge.** The refactor agent shows a high blast radius. The band blinks red. Shake your head or flick your wrist: rejected.
5. **Tilt head** to switch agents, **look up** to show the diff.
6. Approved merges land in the repo and the tests still pass.

Numbers to quote honestly: silent-word decoding is about 42% on 5 words across re-seats (68% same wear). That is why the live path also accepts whisper, nod and tap.
