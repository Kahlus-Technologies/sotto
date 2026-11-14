"""Vexo band -> Sotto. Double-tap = approve. Wrist flick = reject. LED shows state.
Connects ONLY to the band number given (default 4). Run: python3 bridge/band.py 4  (or --sim)"""
import sys, json, math, time, urllib.request
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

def on_tap(e):
    kind = getattr(e, "kind", None) or getattr(e, "type", "") or str(e)
    print("tap", kind)
    if "double" in str(kind).lower() or "2" in str(kind): band.set_led("#00ff66"); send("approve")

def on_motion(m):
    global last_flick
    mag = math.sqrt(m.ax**2 + m.ay**2 + m.az**2)
    if abs(mag - 1.0) > 1.6 and time.time() - last_flick > 1.5:   # hard shake of the wrist
        last_flick = time.time(); print("flick", round(mag, 2)); band.set_led("#ff2030"); send("reject")

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
band.configure(motion=50, events=True)
print("band", N, "ready"); band.wait(86400)
