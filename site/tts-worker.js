/* Jarvis's voice: Kokoro-82M with the "Daniel" voice (the same as Sergio's local Jarvis), run in this
   Web Worker so speech synthesis never blocks the page. The engine files are served by this site;
   the model (about 92 MB, q8) is downloaded from Hugging Face on first use and cached by the browser. */
import { KokoroTTS, env } from './vendor/kokoro/kokoro.web.js';

env.wasmPaths = new URL('./vendor/kokoro/', self.location.href).href;
let tts = null;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load' && !tts) {
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8', device: 'wasm',
        progress_callback: (p) => { if (p.status === 'progress' && p.file && p.file.endsWith('.onnx')) self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total }); }
      });
      self.postMessage({ type: 'ready', isolated: self.crossOriginIsolated, cores: navigator.hardwareConcurrency });
    } else if (msg.type === 'speak') {
      const audio = await tts.generate(msg.text, { voice: 'bm_daniel' });
      const samples = audio.audio;
      self.postMessage({ type: 'audio', id: msg.id, samples, rate: audio.sampling_rate }, [samples.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: String(err && err.message || err) });
  }
};
