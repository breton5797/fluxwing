// Everything audible is synthesised: one-shot effects plus a small step sequencer for the
// soundtrack that follows the current zone and speeds up during fever.
import { ZONES } from './config.js';

const BASS_STEPS = [0, 3, 6, 8, 11, 14];
const ARP = [1, 1.5, 2, 1.189, 1.5, 2, 2.378, 1.5];
const LOOKAHEAD = 0.12;

export function createAudio(settings) {
  let ac = null, sfxBus = null, musicBus = null;
  let on = { sfx: settings.sfx, music: settings.music };
  let music = { playing: false, zone: 0, fever: false };
  let nextNote = 0, stepIdx = 0;

  function init() {
    if (ac) { if (ac.state !== 'running') ac.resume(); return; }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    try {
      ac = new Ctor();
      sfxBus = ac.createGain();
      musicBus = ac.createGain();
      sfxBus.connect(ac.destination);
      musicBus.connect(ac.destination);
      applyGains();
    } catch (err) {
      ac = null; // no audio device: the game stays fully playable, just silent
    }
  }

  function applyGains() {
    if (!ac) return;
    sfxBus.gain.value = on.sfx ? 0.5 : 0;
    musicBus.gain.value = on.music ? 0.32 : 0;
  }

  function voice(bus, freq, { dur = 0.1, type = 'square', vol = 0.15, slide = 0, at = 0, cutoff = 0 }) {
    const t = Math.max(at, ac.currentTime);
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      osc.connect(filter); filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function burst(bus, { dur = 0.4, vol = 0.3, at = 0, type = 'lowpass', freq = 900 }) {
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, n, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), gain = ac.createGain(), filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    src.buffer = buffer;
    gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(bus);
    src.start(Math.max(at, ac.currentTime));
  }

  const tone = (freq, dur, type, vol, slide = 0, delay = 0) => {
    if (ac && on.sfx) voice(sfxBus, freq, { dur, type, vol, slide, at: ac.currentTime + delay });
  };
  const noise = (dur, vol) => { if (ac && on.sfx) burst(sfxBus, { dur, vol }); };
  const chord = (root, ratio, n, dur, type, vol, gap) => {
    for (let i = 0; i < n; i++) tone(root * Math.pow(ratio, i), dur, type, vol, 0, i * gap);
  };

  const sfx = {
    flap: () => tone(520, 0.07, 'triangle', 0.12, 240),
    pass: () => tone(660, 0.09, 'square', 0.07),
    phase: () => tone(880, 0.12, 'sawtooth', 0.07, 500),
    perfect(combo) {
      const base = 523 * Math.pow(1.06, Math.min(combo, 14));
      tone(base, 0.14, 'triangle', 0.12);
      tone(base * 1.25, 0.14, 'triangle', 0.1, 0, 0.05);
      tone(base * 1.5, 0.2, 'triangle', 0.1, 0, 0.1);
    },
    orb: () => tone(1180, 0.06, 'sine', 0.1, 400),
    power: () => chord(440, 1.26, 4, 0.12, 'square', 0.08, 0.06),
    dash() { tone(180, 0.35, 'sawtooth', 0.14, 900); noise(0.25, 0.12); },
    shield() { tone(300, 0.25, 'triangle', 0.2, -200); noise(0.2, 0.2); },
    die() { tone(220, 0.6, 'sawtooth', 0.18, -180); noise(0.6, 0.35); },
    zone: () => chord(330, 1.5, 3, 0.3, 'triangle', 0.1, 0.1),
    fever: () => chord(392, 1.189, 6, 0.16, 'sawtooth', 0.09, 0.05),
    kill() { tone(140, 0.2, 'square', 0.16, 600); noise(0.18, 0.22); },
    revive: () => chord(262, 1.335, 4, 0.22, 'triangle', 0.12, 0.08),
    ui: () => tone(740, 0.05, 'square', 0.06),
    reward: () => chord(660, 1.26, 3, 0.14, 'triangle', 0.1, 0.07),
  };

  function scheduleStep(i, at) {
    const root = ZONES[music.zone].root;
    const hot = music.fever;
    if (i % 4 === 0) voice(musicBus, 120, { dur: 0.16, type: 'sine', vol: 0.5, slide: -80, at });
    if (BASS_STEPS.includes(i)) voice(musicBus, root / 2, { dur: 0.2, type: 'sawtooth', vol: 0.22, at, cutoff: 420 });
    if (hot || i % 2 === 0) {
      const ratio = ARP[(hot ? i : i / 2) % ARP.length];
      voice(musicBus, root * 2 * ratio * (hot ? 2 : 1), { dur: 0.12, type: 'square', vol: 0.07, at });
    }
    if (i % 2 === 1) burst(musicBus, { dur: 0.04, vol: hot ? 0.16 : 0.09, at, type: 'highpass', freq: 6000 });
  }

  /** Call once per frame; schedules any sequencer steps falling inside the lookahead window. */
  function tick() {
    if (!ac || !on.music || !music.playing) return;
    const stepLen = 60 / (108 + music.zone * 4 + (music.fever ? 16 : 0)) / 4;
    if (nextNote < ac.currentTime) nextNote = ac.currentTime + 0.03;
    while (nextNote < ac.currentTime + LOOKAHEAD) {
      scheduleStep(stepIdx, nextNote);
      nextNote += stepLen;
      stepIdx = (stepIdx + 1) % 16;
    }
  }

  return {
    init,
    tick,
    sfx,
    setMusic(patch) { music = { ...music, ...patch }; },
    setEnabled(patch) { on = { ...on, ...patch }; applyGains(); },
  };
}
