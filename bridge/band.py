"""Vexo band -> Sotto. Double-tap = approve. Wrist flick = reject. LED shows state.
Connects ONLY to the band number given (default 4). Run: python3 bridge/band.py 4  (or --sim)"""
import sys, json, math, time, threading, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "vexo-open-kit" / "python"))
from vexo_open.sync import Band

SIM = "--sim" in sys.argv
nums = [a for a in sys.argv[1:] if a.isdigit()]
N = int(nums[0]) if nums else 4

def send(t):
    try: urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8787/gesture", json.dumps({"type": t, "source": "band"}).encode()), timeout=3)
    except Exception as e: print("server:", e)

band = Band.connect(N, transport="sim" if SIM else "ble")
band.set_led("#00ff66")
last_flick = 0.0
last_jolt = 0.0   # any big motion, even below flick level: taps right after it are fake

def on_tap(e):
    kind = str(getattr(e, "kind", None) or getattr(e, "type", "") or e).lower()
    print("tap", kind)
    if "double" not in kind: return
    t0 = time.time()
    def later():            # wait 0.45s: a flick right after (or just before) this "double tap" cancels it
        time.sleep(0.45)
        if abs(last_jolt - t0) < 0.6 or time.time() - last_flick < 0.9: print("double-tap vetoed by flick"); return
        band.set_led("#00ff66"); send("approve")
    threading.Thread(target=later, daemon=True).start()

def on_motion(m):
    global last_flick, last_jolt
    now = time.time()
    a = abs(math.sqrt(m.ax**2 + m.ay**2 + m.az**2) - 1.0)
    g = math.sqrt((m.gx or 0)**2 + (m.gy or 0)**2 + (m.gz or 0)**2)
    if a > 0.7 or g > 250: last_jolt = now
    if (a > 1.2 or g > 450) and now - last_flick > 1.2:
        last_flick = now; print("flick a=%.2f g=%.0f" % (a, g)); band.set_led("#ff2030"); send("reject")

import threading
def led_loop():  # band light mirrors the swarm: blue=working, amber=wants a decision (red if risky), green=all merged
    prev = None
    while True:
        try:
            st = json.load(urllib.request.urlopen("http://127.0.0.1:8787/state", timeout=2))
            cur = ("#ff2030" if st["risky"] else "#ffb000") if st["pending"] else "#2060ff" if st["working"] else "#00ff66"
            if cur != prev and not band.taken_streams.get("audio"):
                band.set_led(cur, pattern="blink" if st["pending"] else "solid", period=400); prev = cur
        except Exception: pass
        time.sleep(0.7)
threading.Thread(target=led_loop, daemon=True).start()
band.on("tap", on_tap); band.on("double-tap", on_tap); band.on("motion", on_motion)
band.configure(motion=100, events=True)
print("band", N, "ready"); band.wait(86400)
