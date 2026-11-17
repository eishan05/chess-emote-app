/**
 * All sounds are synthesized with WebAudio, so the app ships no audio files.
 * Emote "voices" run a sawtooth through two vowel formant filters, which gives
 * a cartoony gibberish voice.
 */
export type SoundName =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'start'
  | 'win'
  | 'lose'
  | 'draw'
  | 'pop'
  | 'notify'
  | 'chat'
  | 'thumbs'
  | 'laugh'
  | 'cry'
  | 'angry'
  | 'shock'
  | 'think'
  | 'cool'
  | 'sleep';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;

try {
  enabled = localStorage.getItem('checkmoji.sound') !== 'off';
} catch {
  /* storage unavailable */
}

export function isSoundOn() {
  return enabled;
}
export function setSoundOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('checkmoji.sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (!enabled || !unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Browsers only allow audio after a user gesture; call this from one. */
export function unlockAudio() {
  unlocked = true;
  ac();
}

interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  attack?: number;
  vibrato?: number;
}

function tone({ freq, to, dur, type = 'sine', vol = 0.3, delay = 0, attack = 0.01, vibrato = 0 }: ToneOpts) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 7;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  delay?: number;
  freq?: number;
  q?: number;
  type?: BiquadFilterType;
}

function noise({ dur, vol = 0.3, delay = 0, freq = 1200, q = 1, type = 'bandpass' }: NoiseOpts) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const VOWELS = {
  a: [800, 1200],
  e: [450, 2100],
  i: [300, 2600],
  o: [500, 850],
  u: [350, 700],
} as const;

interface VoiceOpts {
  pitch: number;
  to?: number;
  dur: number;
  vowel: keyof typeof VOWELS;
  vol?: number;
  delay?: number;
  vibrato?: number;
}

/** A short cartoon "syllable". */
function voice({ pitch, to, dur, vowel, vol = 0.5, delay = 0, vibrato = 0 }: VoiceOpts) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(pitch, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const fq of VOWELS[vowel]) {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = fq;
    f.Q.value = 6;
    o.connect(f).connect(g);
  }
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SOUNDS: Record<SoundName, () => void> = {
  move: () => {
    noise({ dur: 0.07, vol: 0.5, freq: 900, q: 2 });
    tone({ freq: 180, to: 120, dur: 0.08, type: 'triangle', vol: 0.25 });
  },
  capture: () => {
    noise({ dur: 0.12, vol: 0.7, freq: 1600, q: 1.5 });
    tone({ freq: 260, to: 90, dur: 0.14, type: 'square', vol: 0.12 });
  },
  castle: () => {
    noise({ dur: 0.06, vol: 0.45, freq: 900, q: 2 });
    noise({ dur: 0.06, vol: 0.45, freq: 1100, q: 2, delay: 0.1 });
  },
  check: () => {
    tone({ freq: 880, dur: 0.12, type: 'square', vol: 0.12 });
    tone({ freq: 660, dur: 0.18, type: 'square', vol: 0.12, delay: 0.12 });
  },
  start: () => {
    [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'triangle', vol: 0.25, delay: i * 0.09 }));
  },
  win: () => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: i === 5 ? 0.5 : 0.15, type: 'triangle', vol: 0.28, delay: i * 0.11 }),
    );
  },
  lose: () => {
    [392, 370, 349, 262].forEach((f, i) => tone({ freq: f, dur: i === 3 ? 0.6 : 0.22, type: 'triangle', vol: 0.25, delay: i * 0.22, vibrato: i === 3 ? 6 : 0 }));
  },
  draw: () => {
    [523, 494, 523].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.22, delay: i * 0.16 }));
  },
  pop: () => tone({ freq: 400, to: 900, dur: 0.09, type: 'sine', vol: 0.3 }),
  notify: () => {
    tone({ freq: 740, dur: 0.1, type: 'sine', vol: 0.25 });
    tone({ freq: 988, dur: 0.16, type: 'sine', vol: 0.25, delay: 0.09 });
  },
  chat: () => {
    voice({ pitch: 330, to: 420, dur: 0.1, vowel: 'e', vol: 0.4 });
    voice({ pitch: 420, to: 360, dur: 0.14, vowel: 'a', vol: 0.4, delay: 0.11 });
  },
  thumbs: () => {
    voice({ pitch: 300, to: 520, dur: 0.28, vowel: 'a', vol: 0.5 });
    tone({ freq: 1319, dur: 0.18, vol: 0.12, delay: 0.25 });
    tone({ freq: 1760, dur: 0.3, vol: 0.12, delay: 0.33 });
  },
  laugh: () => {
    const p = [520, 480, 500, 450, 470, 410];
    p.forEach((f, i) => voice({ pitch: f, to: f * 0.85, dur: 0.1, vowel: i % 2 ? 'e' : 'a', vol: 0.45, delay: i * 0.13 }));
  },
  cry: () => {
    voice({ pitch: 520, to: 340, dur: 0.9, vowel: 'a', vol: 0.45, vibrato: 25 });
    voice({ pitch: 470, to: 300, dur: 0.7, vowel: 'o', vol: 0.4, delay: 0.95, vibrato: 25 });
  },
  angry: () => {
    voice({ pitch: 95, to: 110, dur: 0.55, vowel: 'u', vol: 0.6, vibrato: 18 });
    voice({ pitch: 140, to: 90, dur: 0.35, vowel: 'a', vol: 0.55, delay: 0.55 });
    noise({ dur: 0.4, vol: 0.12, freq: 3000, q: 0.7, delay: 0.3 });
  },
  shock: () => {
    voice({ pitch: 260, to: 700, dur: 0.35, vowel: 'o', vol: 0.5 });
    tone({ freq: 1400, dur: 0.12, type: 'square', vol: 0.06, delay: 0.3 });
  },
  think: () => {
    voice({ pitch: 200, to: 230, dur: 0.3, vowel: 'u', vol: 0.4 });
    voice({ pitch: 230, to: 180, dur: 0.5, vowel: 'u', vol: 0.4, delay: 0.32, vibrato: 8 });
  },
  cool: () => {
    tone({ freq: 90, to: 55, dur: 0.4, type: 'sawtooth', vol: 0.12 });
    voice({ pitch: 180, to: 150, dur: 0.35, vowel: 'e', vol: 0.45, delay: 0.15 });
    [1568, 2093, 2637].forEach((f, i) => tone({ freq: f, dur: 0.15, vol: 0.08, delay: 0.45 + i * 0.06 }));
  },
  sleep: () => {
    noise({ dur: 0.7, vol: 0.25, freq: 300, q: 3, type: 'lowpass' });
    tone({ freq: 700, to: 1100, dur: 0.5, vol: 0.06, delay: 0.75 });
    noise({ dur: 0.7, vol: 0.25, freq: 300, q: 3, type: 'lowpass', delay: 1.35 });
  },
};

export function play(name: SoundName) {
  try {
    SOUNDS[name]();
  } catch {
    /* audio failures should never break the game */
  }
}
