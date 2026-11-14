"""Sotto voice, built on Pipecat. Mic -> Silero VAD -> Deepgram STT -> router -> (Sotto server).
Server events -> ElevenLabs TTS -> speakers.
Say "Sotto, <task>" to start a swarm. When an agent is waiting: "yes / approve / merge" or "no / stop / reject".
Run: .venv/bin/python voice/voice.py"""
import asyncio, json, os, re, urllib.request
from pathlib import Path
for l in (Path.home() / ".vexohacks.env").read_text().splitlines():
    k, _, v = l.partition("=")
    if k and not k.startswith("#") and k not in os.environ: os.environ[k] = v

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import TranscriptionFrame, TTSSpeakFrame, Frame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transports.local.audio import LocalAudioTransport, LocalAudioTransportParams

SERVER = "http://127.0.0.1:8787"
YES = re.compile(r"\b(yes|yeah|approve|approved|merge|do it|go ahead|confirm|ship it)\b", re.I)
NO = re.compile(r"\b(no|nope|stop|reject|cancel|don'?t|negative|abort)\b", re.I)
WAKE = re.compile(r"^\W*(hey\s+)?(sotto|soto|sato|otto|so\s+to|so\s+toe|sorto|sortie|soda)\b[\s,:.-]*", re.I)

def post(path, body):
    req = urllib.request.Request(SERVER + path, json.dumps(body).encode(), {"content-type": "application/json"})
    try: urllib.request.urlopen(req, timeout=5)
    except Exception as e: print("server:", e)

def state():
    try: return json.load(urllib.request.urlopen(SERVER + "/state", timeout=2))
    except Exception: return {}

class Router(FrameProcessor):
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if os.environ.get('SOTTO_DEBUG'):
            if type(frame).__name__ == 'InputAudioRawFrame':
                import numpy as np; self.n = getattr(self, 'n', 0) + 1; pk = int(np.abs(np.frombuffer(frame.audio, dtype=np.int16)).max())
                if self.n % 50 == 0 or pk > 1500: print('audio', frame.sample_rate, frame.num_channels, 'peak', pk)
            else: print('frame', type(frame).__name__, getattr(frame, 'text', ''))
        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip(); print("heard:", text)
            st = state()
            if st.get("pending"):
                if YES.search(text) and not NO.search(text): post("/gesture", {"type": "approve", "source": "voice"}); return
                if NO.search(text): post("/gesture", {"type": "reject", "source": "voice"}); return
            m = WAKE.match(text)
            if m and len(text) > m.end() + 3:
                post("/task", {"text": text[m.end():]}); await self.push_frame(TTSSpeakFrame("On it."))
            return   # transcripts are consumed here
        await self.push_frame(frame, direction)

async def watch_server(task: PipelineTask):
    """Speak each new pending request and the final outcome."""
    last = ""
    while True:
        await asyncio.sleep(0.6)
        try:
            with urllib.request.urlopen(SERVER + "/speak", timeout=2) as r: text = json.load(r).get("text", "")
        except Exception: continue
        if text and text != last: last = text; await task.queue_frame(TTSSpeakFrame(text))
        if not text: last = ""

async def main():
    transport = LocalAudioTransport(LocalAudioTransportParams(audio_in_enabled=True, audio_in_sample_rate=16000, audio_out_enabled=True))
    from pipecat.services.deepgram.stt import LiveOptions
    stt = DeepgramSTTService(api_key=os.environ["DEEPGRAM_API_KEY"], sample_rate=16000,
        live_options=LiveOptions(model="nova-3", language="en", smart_format=True, interim_results=True, endpointing=400, keyterm=["Sotto"]))
    tts = ElevenLabsTTSService(api_key=os.environ["ELEVENLABS_API_KEY"], voice_id="JBFqnCBsd6RMkjVDRZzb", model="eleven_flash_v2_5")
    pipeline = Pipeline([transport.input(), stt, Router(), tts, transport.output()])
    task = PipelineTask(pipeline)
    asyncio.create_task(watch_server(task))
    print("voice ready: say 'Sotto, fix the login bug'")
    await PipelineRunner().run(task)

asyncio.run(main())
