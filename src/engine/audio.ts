// Procedural Web Audio SFX — no audio asset files. Each sound is a short
// synthesized envelope. Gesture-gated (browsers block audio until user input)
// and mutable; mute persists in localStorage.

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const KEY = 'prehisteria-muted';
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* ignore */ }

export function isMuted(): boolean { return muted; }

export function setMuted(v: boolean): void {
  muted = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
  if (ac && master) master.gain.setTargetAtTime(v ? 0 : 1, ac.currentTime, 0.02);
}

export function toggleMuted(): boolean { setMuted(!muted); return muted; }

// Call from a user gesture (first key/touch). Idempotent.
export function initAudio(): void {
  if (ac) { if (ac.state === 'suspended') void ac.resume(); return; }
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ac.destination);
}

type Sfx =
  | 'jump' | 'attack' | 'hit' | 'collect' | 'gem' | 'hurt'
  | 'complete' | 'select' | 'checkpoint';

// (waveform, startFreq, endFreq, duration, peakGain)
function tone(
  type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0,
): void {
  if (!ac || !master) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number): void {
  if (!ac || !master) return;
  const t = ac.currentTime;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  const g = ac.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g).connect(master);
  src.start(t);
}

export function play(name: Sfx): void {
  if (!ac) return;
  switch (name) {
    case 'jump':     tone('square', 320, 620, 0.16, 0.25); break;
    case 'attack':   noise(0.09, 0.2); tone('square', 180, 90, 0.09, 0.12); break;
    case 'hit':      tone('square', 500, 120, 0.14, 0.28); noise(0.08, 0.18); break;
    case 'collect':  tone('triangle', 660, 990, 0.10, 0.3); break;
    case 'gem':      tone('triangle', 700, 1200, 0.12, 0.3); tone('triangle', 1050, 1600, 0.14, 0.22, 0.08); break;
    case 'hurt':     tone('sawtooth', 300, 80, 0.28, 0.3); break;
    case 'complete': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.28, i * 0.12)); break;
    case 'select':   tone('square', 440, 660, 0.07, 0.2); break;
    case 'checkpoint': tone('triangle', 520, 780, 0.12, 0.28); tone('triangle', 780, 1040, 0.14, 0.24, 0.1); break;
  }
}
