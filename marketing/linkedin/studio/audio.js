// Procedural soundtrack + sound effects, built with the Web Audio API.
// The same function drives a live AudioContext (preview) and an OfflineAudioContext (MP4 render),
// so what you hear in the browser is what ends up in the video.

import { rng } from './engine.js';

const CHORDS = {
  I: [0, 4, 7, 11], ii: [2, 5, 9, 12], iii: [4, 7, 11, 14], IV: [5, 9, 12, 16], V: [7, 11, 14, 17], vi: [9, 12, 16, 19],
  i: [0, 3, 7, 10], III: [3, 7, 10, 14], iv: [5, 8, 12, 15], VI: [8, 12, 15, 19], VII: [10, 14, 17, 22], v: [7, 10, 14, 17],
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function buildAudio(ctx, spec, offset = 0) {
  const R = rng(spec.seed ?? 7);
  const dur = spec.duration;
  const T = t => offset + t;

  // ---------- mix bus ----------
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, T(0));
  master.gain.linearRampToValueAtTime(0.95, T(0.04));
  master.gain.setValueAtTime(0.95, T(dur - 1.1));
  master.gain.linearRampToValueAtTime(0, T(dur - 0.05));
  master.connect(comp);

  // reverb from a seeded noise impulse
  const rev = ctx.createConvolver();
  const irLen = Math.floor(ctx.sampleRate * 2.6);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < irLen; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
  }
  rev.buffer = ir;
  const revOut = ctx.createGain(); revOut.gain.value = 0.32;
  rev.connect(revOut); revOut.connect(master);

  const music = ctx.createGain(); music.gain.value = spec.music?.level ?? 0.5; music.connect(master);
  const musicSend = ctx.createGain(); musicSend.gain.value = 0.35; music.connect(musicSend); musicSend.connect(rev);
  const sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
  const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.22; sfx.connect(sfxSend); sfxSend.connect(rev);

  // music dips (e.g. silence for a dramatic beat): [t, length, level]
  for (const [t, len, lvl] of spec.music?.dips ?? []) {
    const base = spec.music?.level ?? 0.5;
    music.gain.setValueAtTime(base, T(t));
    music.gain.linearRampToValueAtTime(base * lvl, T(t + 0.12));
    music.gain.setValueAtTime(base * lvl, T(t + len));
    music.gain.linearRampToValueAtTime(base, T(t + len + 0.35));
  }

  // shared noise buffer
  const nLen = ctx.sampleRate * 2;
  const noise = ctx.createBuffer(1, nLen, ctx.sampleRate);
  { const d = noise.getChannelData(0); for (let i = 0; i < nLen; i++) d[i] = R() * 2 - 1; }

  const env = (g, t, a, peak, dec, sustain = 0.0001) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + dec);
  };
  const osc = (type, f, t, stop, dest) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(dest); o.start(t); o.stop(stop); return o;
  };
  const noiseSrc = (t, len, dest, rate = 1) => {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = rate;
    s.connect(dest); s.start(t, R() * 1.5, len); return s;
  };

  // ---------- music ----------
  const m = spec.music;
  if (m) {
    const bpm = m.bpm ?? 104, beat = 60 / bpm, bar = beat * 4;
    const key = m.key ?? 60;
    const prog = m.prog ?? ['I', 'V', 'vi', 'IV'];
    const start = m.start ?? 0;
    const drumsFrom = m.drumsFrom ?? bar;
    const mood = m.mood ?? 'bright';
    const bars = Math.ceil((dur - start) / bar) + 1;

    // delay for the arp
    const dl = ctx.createDelay(1); dl.delayTime.value = beat * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    dl.connect(dlf); dlf.connect(fb); fb.connect(dl);
    const dlOut = ctx.createGain(); dlOut.gain.value = 0.45; dlf.connect(dlOut); dlOut.connect(music);

    for (let b = 0; b < bars; b++) {
      const t0 = start + b * bar;
      if (t0 > dur) break;
      const ch = CHORDS[prog[b % prog.length]];

      // pad
      const padF = ctx.createBiquadFilter(); padF.type = 'lowpass';
      padF.frequency.setValueAtTime(mood === 'deep' ? 520 : 820, T(t0));
      padF.frequency.linearRampToValueAtTime(mood === 'deep' ? 900 : 1500, T(t0 + bar * 0.6));
      padF.connect(music);
      const pg = ctx.createGain(); pg.connect(padF);
      pg.gain.setValueAtTime(0.0001, T(t0));
      pg.gain.linearRampToValueAtTime(1, T(t0 + 0.5));
      pg.gain.setValueAtTime(1, T(t0 + bar - 0.1));
      pg.gain.linearRampToValueAtTime(0.0001, T(t0 + bar + 0.6));
      for (const n of ch) {
        const f = mtof(key - 12 + n);
        for (const det of [-8, 7]) {
          const o = osc('sawtooth', f, T(t0), T(t0 + bar + 0.7), pg);
          o.detune.value = det;
          const g = ctx.createGain(); g.gain.value = 0.022;
          o.disconnect(); o.connect(g); g.connect(pg);
        }
      }

      // bass
      const bassHits = mood === 'calm' || mood === 'deep' ? [0, 2] : [0, 1.5, 2, 3.5];
      for (const h of bassHits) {
        const t = T(t0 + h * beat);
        const g = ctx.createGain(); g.connect(music);
        env(g, t, 0.01, h % 1 ? 0.11 : 0.17, beat * 1.4);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.connect(g);
        osc('triangle', mtof(key - 24 + ch[0]), t, t + beat * 1.6, lp);
        osc('sine', mtof(key - 36 + ch[0]), t, t + beat * 1.6, lp);
      }

      // arp: 8th notes over chord tones, an octave up
      const pattern = mood === 'deep' ? [0, 2, 1, 3, 0, 2, 1, 2] : [0, 1, 2, 3, 2, 1, 2, 3];
      const arpFrom = m.arpFrom ?? 0;
      if (t0 + bar > arpFrom) {
        for (let i = 0; i < 8; i++) {
          const at = t0 + i * beat / 2;
          if (at < arpFrom || at > dur - 0.4) continue;
          const t = T(at);
          const n = ch[pattern[i] % ch.length] + key + 12;
          const g = ctx.createGain(); g.connect(music); g.connect(dl);
          env(g, t, 0.004, i % 2 ? 0.045 : 0.065, 0.42);
          osc('triangle', mtof(n), t, t + 0.5, g);
          const g2 = ctx.createGain(); g2.gain.value = 0.35; g2.connect(g);
          osc('sine', mtof(n + 12), t, t + 0.3, g2);
        }
      }

      // drums
      for (let k = 0; k < 4; k++) {
        const at = t0 + k * beat;
        if (at < drumsFrom || at > dur - 0.6) continue;
        const t = T(at);
        const kickOn = mood === 'bright' || mood === 'pulse' ? true : k % 2 === 0;
        if (kickOn) {
          const g = ctx.createGain(); g.connect(music);
          env(g, t, 0.002, 0.55, 0.32);
          const o = osc('sine', 150, t, t + 0.4, g);
          o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        }
        if ((k === 1 || k === 3) && mood !== 'deep') {
          const g = ctx.createGain(); g.connect(music);
          env(g, t, 0.002, mood === 'calm' ? 0.06 : 0.12, 0.17);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.8; bp.connect(g);
          noiseSrc(t, 0.25, bp);
        }
        // hats on the off-beats
        const ht = T(at + beat / 2);
        if (at + beat / 2 < dur - 0.6) {
          const g = ctx.createGain(); g.connect(music);
          env(g, ht, 0.001, mood === 'deep' ? 0.025 : 0.045, 0.05);
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500; hp.connect(g);
          noiseSrc(ht, 0.08, hp);
        }
      }
    }
  }

  // ---------- sound effects ----------
  const pan = (dest, p) => { if (!ctx.createStereoPanner) return dest; const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(dest); return s; };
  const bell = (f, t, peak, dec, dest = sfx) => {
    const g = ctx.createGain(); g.connect(dest); env(g, t, 0.003, peak, dec);
    osc('sine', f, t, t + dec + 0.1, g);
    const g2 = ctx.createGain(); g2.gain.value = 0.18; g2.connect(g);
    osc('sine', f * 2.76, t, t + dec * 0.5, g2);
  };

  const FX = {
    pop({ t, p = 1, v = 1, pan: pn = 0 }) {
      const d = pan(sfx, pn);
      const g = ctx.createGain(); g.connect(d); env(g, t, 0.003, 0.32 * v, 0.11);
      const o = osc('sine', 420 * p, t, t + 0.16, g);
      o.frequency.exponentialRampToValueAtTime(980 * p, t + 0.05);
    },
    blip({ t, p = 1, v = 1 }) {
      const g = ctx.createGain(); g.connect(sfx); env(g, t, 0.002, 0.08 * v, 0.07);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(g);
      osc('square', 660 * p, t, t + 0.1, lp);
    },
    tick({ t, v = 1 }) {
      const g = ctx.createGain(); g.connect(sfx); env(g, t, 0.001, 0.12 * v, 0.03);
      osc('sine', 2100, t, t + 0.05, g);
    },
    type({ t, len = 1, v = 1 }) {
      let at = t;
      while (at < t + len) {
        const g = ctx.createGain(); g.connect(pan(sfx, (R() - 0.5) * 0.5));
        env(g, at, 0.001, (0.07 + R() * 0.06) * v, 0.025);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2800 + R() * 2500; bp.Q.value = 2; bp.connect(g);
        noiseSrc(at, 0.04, bp);
        at += 0.055 + R() * 0.05;
      }
    },
    whoosh({ t, len = 0.6, v = 1, up = true }) {
      const g = ctx.createGain(); g.connect(sfx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32 * v, t + len * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      const sp = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(up ? 350 : 3500, t);
      bp.frequency.exponentialRampToValueAtTime(up ? 3800 : 300, t + len);
      if (sp) { sp.pan.setValueAtTime(-0.6, t); sp.pan.linearRampToValueAtTime(0.6, t + len); bp.connect(sp); sp.connect(g); } else bp.connect(g);
      noiseSrc(t, len + 0.05, bp);
    },
    ding({ t, v = 1 }) {
      bell(1318.5, t, 0.2 * v, 1.3);
      bell(1975.5, t + 0.1, 0.16 * v, 1.5);
    },
    chime({ t, v = 1, key = 84 }) {
      [0, 4, 7, 12].forEach((n, i) => bell(mtof(key + n), t + i * 0.075, 0.11 * v, 1.1));
    },
    sparkle({ t, v = 1 }) {
      for (let i = 0; i < 6; i++) bell(2200 + R() * 2400, t + i * 0.05 + R() * 0.03, 0.04 * v, 0.5);
    },
    riser({ t, len = 1.5, v = 1 }) {
      const g = ctx.createGain(); g.connect(sfx);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * v, t + len);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 0.04);
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.Q.value = 1;
      hp.frequency.setValueAtTime(300, t); hp.frequency.exponentialRampToValueAtTime(6000, t + len);
      hp.connect(g); noiseSrc(t, len + 0.1, hp);
      const g2 = ctx.createGain(); g2.gain.value = 0.18; g2.connect(g);
      const o = osc('sawtooth', 180, t, t + len + 0.05, g2);
      o.frequency.exponentialRampToValueAtTime(720, t + len);
    },
    impact({ t, v = 1 }) {
      const g = ctx.createGain(); g.connect(sfx); env(g, t, 0.003, 0.7 * v, 1.0);
      const o = osc('sine', 85, t, t + 1.2, g); o.frequency.exponentialRampToValueAtTime(38, t + 0.6);
      const g2 = ctx.createGain(); g2.connect(sfx); env(g2, t, 0.002, 0.25 * v, 0.35);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g2);
      noiseSrc(t, 0.5, lp);
      bell(mtof(72), t + 0.02, 0.07 * v, 2.2);
      bell(mtof(79), t + 0.02, 0.05 * v, 2.2);
    },
    lock({ t, v = 1 }) {
      for (const dt of [0, 0.075]) {
        const g = ctx.createGain(); g.connect(sfx); env(g, t + dt, 0.001, 0.22 * v, 0.03);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200; hp.connect(g);
        noiseSrc(t + dt, 0.05, hp);
      }
      const g = ctx.createGain(); g.connect(sfx); env(g, t + 0.08, 0.002, 0.35 * v, 0.2);
      const o = osc('sine', 190, t + 0.08, t + 0.35, g); o.frequency.exponentialRampToValueAtTime(85, t + 0.25);
    },
    glitch({ t, len = 0.5, v = 1 }) {
      for (let at = t; at < t + len; at += 0.032) {
        const g = ctx.createGain(); g.connect(sfx); env(g, at, 0.001, 0.035 * v, 0.025);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.connect(g);
        osc('square', 180 + R() * 1600, at, at + 0.035, lp);
      }
    },
    mic({ t, v = 1 }) {
      bell(880, t, 0.12 * v, 0.25);
      bell(1320, t + 0.09, 0.12 * v, 0.35);
    },
    swipe({ t, v = 1 }) { FX.whoosh({ t, len: 0.28, v: 0.6 * v }); },
  };

  for (const c of spec.cues ?? []) {
    if (c.t < (spec.from ?? 0) || c.t > dur) continue;
    const f = FX[c.type];
    if (f) f({ ...c, t: T(c.t) });
  }
}

// Encode an AudioBuffer as 16-bit PCM WAV.
export function encodeWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]));
    data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Uint8Array(data.buffer);
}
