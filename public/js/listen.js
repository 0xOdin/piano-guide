// Hearing a real piano on the practice page (/practice/): a MIDI keyboard, or the microphone.
//  - MIDI (connectMidi): every key pressed or let go on a keyboard plugged into the computer. Chrome, Edge and
//    Firefox can do this; Safari can't.
//  - Microphone (Listener): many times a second it reports the notes it hears sounding together (for a chord), and
//    each time a key is struck (for a scale).
// The pitch detection (detectNotes, StrikeFinder) works on plain arrays of samples, so it can be tried out without a
// browser or a piano.

/* ---------- MIDI ---------- */

// Calls onNote(midi, true) when a key goes down and onNote(midi, false) when it comes up (60 = middle C), and
// onDevices(names) now and whenever a keyboard is plugged in or out. Fails if the browser has no MIDI or the person
// says no.
async function connectMidi(onNote, onDevices) {
  const access = await navigator.requestMIDIAccess();
  const attach = () => {
    const inputs = [...access.inputs.values()];
    for (const input of inputs) {
      input.onmidimessage = (e) => {
        const [status, note, velocity] = e.data;
        const type = status & 0xf0;
        if (type === 0x90 && velocity > 0) onNote(note, true);
        else if (type === 0x80 || type === 0x90) onNote(note, false); // note off, or note on at velocity 0
      };
    }
    onDevices(inputs.map((i) => i.name));
  };
  access.onstatechange = attach;
  attach();
}

/* ---------- Pitch and loudness ---------- */

function rms(samples, from = 0) {
  let sum = 0;
  for (let i = from; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length - from));
}

// The sound of the room when nothing plays. It drops at once to anything quieter and creeps up very slowly, so a
// long run of music doesn't pass for the room.
class RoomLevel {
  constructor() {
    this.floor = 0.002;
  }

  // true when `level` (an rms) is clearly louder than the room
  loud(level) {
    this.floor = level < this.floor ? level : this.floor + (level - this.floor) * 0.0001;
    return level > Math.max(0.001, this.floor * 4); // a single note played softly, across the room, still counts
  }
}

/* ---------- The spectrum: which frequencies are sounding ---------- */

// In-place fast Fourier transform of re and im (length a power of two)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

const FFT_SIZE = 16384;
const LOWEST = 36; // C2
const HIGHEST = 96; // C7
const MAX_HZ = 5000;
const WHITEN = 0.7; // 1 leaves the spectrum as it is; lower evens the bands out more
const NEXT_NOTE = 0.22; // a further note must be at least this strong, compared with the strongest
const OWN_PITCH = 0.12; // a note's own pitch must be at least this loud, compared with its loudest overtone
const BELOW = 0.6; // a lower note that explains a note as its overtone wins if it is at least this strong
const LONE = 0.15; // a peak whose octave is weaker than this (compared with it) is alone: an overtone, maybe
const RISE = 1.8; // a note that grows this much in a moment was struck (again)
const CLEAR = 0.3; // and it counts when, a moment later, it is at least this strong compared with the strongest

// How strong each frequency is in the newest `length` samples (up to MAX_HZ): { mag, binHz }
function magnitudes(samples, sampleRate, length) {
  const n = Math.min(samples.length, length, FFT_SIZE);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const start = samples.length - n;
  for (let i = 0; i < n; i++) re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const binHz = sampleRate / FFT_SIZE;
  const mag = new Float64Array(Math.min(FFT_SIZE / 2, Math.ceil((MAX_HZ * 1.1) / binHz) + 2));
  for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(re[k], im[k]);
  return { mag, binHz };
}

// Evens the spectrum out so that loud low notes don't drown the rest (Klapuri's spectral whitening: each band, about
// a third of an octave wide, is brought part of the way towards the same level)
function whiten(mag, binHz) {
  const top = mag.length - 1;
  const centres = [];
  for (let b = 0; ; b++) {
    const c = 229 * (Math.pow(10, (b + 1) / 21.4) - 1);
    if (c > MAX_HZ * 1.1) break;
    centres.push(c);
  }
  const gains = centres.map((c, b) => {
    const lo = b > 0 ? centres[b - 1] : 0;
    const hi = b < centres.length - 1 ? centres[b + 1] : c * 1.3;
    let sum = 0;
    let weight = 0;
    for (let k = Math.ceil(lo / binHz); k <= Math.min(top, hi / binHz); k++) {
      const f = k * binHz;
      const w = f < c ? (f - lo) / (c - lo) : (hi - f) / (hi - c);
      sum += w * mag[k] * mag[k];
      weight += w;
    }
    return Math.pow(Math.sqrt(sum / Math.max(weight, 1e-9)) + 1e-12, WHITEN - 1);
  });
  const out = new Float64Array(mag.length);
  let b = 1;
  for (let k = 0; k <= top; k++) {
    const f = k * binHz;
    while (b < centres.length - 1 && f > centres[b]) b++;
    const t = Math.min(1, Math.max(0, (f - centres[b - 1]) / (centres[b] - centres[b - 1])));
    out[k] = mag[k] * (gains[b - 1] * (1 - t) + gains[b] * t);
  }
  return out;
}

// Only the peaks: a strong note's slope on either side of its peak is not another note
function peaksOf(spec) {
  const peaks = new Float64Array(spec.length);
  for (let k = 1; k < spec.length - 1; k++) if (spec[k] > spec[k - 1] && spec[k] >= spec[k + 1]) peaks[k] = spec[k];
  return peaks;
}

// The strongest peak near frequency f (within a third of a semitone or one bin) -> its bin, or -1
function peakNear(peaks, binHz, f) {
  const lo = Math.max(1, Math.floor(Math.min(f * 0.981, f - binHz) / binHz));
  const hi = Math.min(peaks.length - 2, Math.ceil(Math.max(f * 1.019, f + binHz) / binHz));
  let best = -1;
  for (let k = lo; k <= hi; k++) if (peaks[k] > 0 && (best < 0 || peaks[k] > peaks[best])) best = k;
  return best;
}

// The peaks of a note's pitch and overtones (-1 where there is none) and their heights
function partialsOf(peaks, binHz, f0) {
  const parts = [];
  for (let h = 1; h * f0 <= MAX_HZ && h <= 12; h++) parts.push(peakNear(peaks, binHz, h * f0));
  return { parts, amps: parts.map((k) => (k >= 0 ? peaks[k] : 0)) };
}

// How strongly a note at f0 is there: its peaks at f0, 2·f0, 3·f0 ... added up, the higher ones counting less.
// A piano's overtones run slightly sharp, which the third-of-a-semitone window allows for.
function salience(peaks, binHz, f0) {
  let s = 0;
  for (let h = 1; h * f0 <= MAX_HZ && h <= 12; h++) {
    const k = peakNear(peaks, binHz, h * f0);
    if (k >= 0) s += ((f0 + 27) / (h * f0 + 320)) * peaks[k];
  }
  return s;
}

// The notes in a spectrum's peaks, strongest first: [{ midi, strength, power }], strength 1 for the strongest and
// power how strong it is in itself. `cents`: how far this piano's tuning is from A = 440 Hz (see Tuning). Finds the strongest note, takes its overtones out of the peaks, and repeats while
// something clear is left (Klapuri's iterative method, simplified). A note only counts if its own pitch, not just its
// overtones, can be heard.
function findNotes(spectrum, binHz, cents = 0) {
  const shift = Math.pow(2, cents / 1200);
  const freqOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12) * shift; // the notes as this piano plays them
  const peaks = Float64Array.from(spectrum); // the overtones are taken out of a copy
  const found = [];
  const tried = new Set();
  let first = 0;
  for (let round = 0; round < 12 && found.length < 6; round++) {
    let best = null;
    for (let m = LOWEST; m <= HIGHEST; m++) {
      if (tried.has(m)) continue;
      const f0 = freqOf(m);
      if (peakNear(peaks, binHz, f0) < 0) continue;
      const s = salience(peaks, binHz, f0);
      if (!best || s > best.s) best = { midi: m, s, f0 };
    }
    if (!best || best.s <= 0 || (first && best.s < first * NEXT_NOTE)) break;
    // A note's overtones can outshine the note itself: an E4's third overtone is a B5. If a note that has the best
    // one among its overtones (a 12th, or two octaves and a 3rd or a 5th, below) is clearly there, it explains it.
    // the note's own pitch must stand out among its overtones, or it is a ghost made of other notes' overtones
    const heard = (amps) => amps[0] >= Math.max(...amps) * OWN_PITCH;
    let lower = null;
    for (const gap of [19, 28, 31]) {
      const m = best.midi - gap;
      if (m < LOWEST || tried.has(m)) continue;
      const f0 = freqOf(m);
      const { amps } = partialsOf(peaks, binHz, f0);
      const s = salience(peaks, binHz, f0);
      if (amps[0] > 0 && heard(amps) && s >= best.s * BELOW && (!lower || s > lower.s)) lower = { midi: m, s, f0 };
    }
    if (lower) best = lower;
    tried.add(best.midi);
    const { parts, amps } = partialsOf(peaks, binHz, best.f0);
    if (!heard(amps)) continue;
    // a lone peak on an overtone of a note already found is that note ringing, not a note of its own: a real note
    // has an octave overtone too. (Going up a scale, a note's 9th overtone is the next note, two octaves higher.)
    const overtoneOf = (f) => {
      const k = Math.round(best.f0 / freqOf(f.midi));
      return k >= 2 && Math.abs(best.f0 / (k * freqOf(f.midi)) - 1) < 0.03;
    };
    if (amps.length > 1 && amps[1] < amps[0] * LONE && found.some(overtoneOf)) continue;
    if (!first) first = best.s;
    found.push({ midi: best.midi, strength: best.s / first, power: best.s });
    // take out what this note adds to each of its peaks: no more than its neighbours, so a peak shared with
    // another note keeps that note's share
    parts.forEach((k, i) => {
      if (k < 0) return;
      const near = amps.slice(Math.max(0, i - 1), i + 2).filter((a) => a > 0);
      peaks[k] = Math.max(0, peaks[k] - Math.min(amps[i], near.reduce((x, y) => x + y, 0) / near.length));
    });
  }
  return found;
}

// The notes sounding together in the newest samples (a 170 ms stretch is enough). Works best on chords in the middle
// of the keyboard: a low bass note's overtones can pass for notes of their own (a C's fifth overtone is an E).
// `tuning` (a Tuning) learns from the sound how this piano is tuned, unless `learn` is false (while the page itself
// plays, as it is tuned to A = 440 Hz exactly).
function detectNotes(samples, sampleRate, tuning = null, learn = true) {
  const { mag, binHz } = magnitudes(samples, sampleRate, 8192);
  if (tuning && learn) tuning.feed(mag, binHz);
  return findNotes(peaksOf(whiten(mag, binHz)), binHz, tuning ? tuning.cents : 0);
}

/* ---------- The piano's tuning ---------- */

// How far, in cents (hundredths of a semitone), the piano sits from A = 440 Hz. A piano at home may be out by a
// quarter of a semitone or more, which would put its notes between the ones listened for. Every clear peak between
// 100 and 1200 Hz (mostly the notes' own pitches and octaves) votes for how far it is from the nearest semitone. The
// votes go round a circle, as 49 cents sharp is next to 49 cents flat, and fade away slowly, so the tuning settles
// within a few readings and then follows the piano.
class Tuning {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.cents = 0;
  }

  feed(mag, binHz) {
    const lo = Math.ceil(100 / binHz);
    const hi = Math.min(mag.length - 2, Math.floor(1200 / binHz));
    let loudest = 0;
    for (let k = lo; k <= hi; k++) loudest = Math.max(loudest, mag[k]);
    if (!loudest) return;
    this.x *= 0.9;
    this.y *= 0.9;
    for (let k = lo; k <= hi; k++) {
      if (mag[k] < loudest * 0.2 || mag[k] < mag[k - 1] || mag[k] < mag[k + 1]) continue;
      // the peak's own frequency, between the bins: a parabola through the peak and its neighbours (in decibels)
      const [a, b, c] = [mag[k - 1], mag[k], mag[k + 1]].map((v) => Math.log(v + 1e-12));
      const f = (k + (a - c) / (2 * (a - 2 * b + c) || 1)) * binHz;
      const away = (1200 * Math.log2(f / 440)) % 100; // cents from the nearest semitone below, then either side
      const angle = (2 * Math.PI * away) / 100;
      this.x += mag[k] * Math.cos(angle);
      this.y += mag[k] * Math.sin(angle);
    }
    this.cents = (Math.atan2(this.y, this.x) * 100) / (2 * Math.PI);
  }
}

/* ---------- One note after another ---------- */

// Turns the notes heard in each reading (detectNotes, every 60 ms or so) into the moments keys were struck, to follow
// a scale. A key was struck when its note wasn't heard a moment ago, or suddenly got much louder (struck again while
// it still rang): compared with the readings 120 to 180 ms back, as a struck note grows over a few readings. It only
// counts if the note is still there, clearly, in one of the next two readings: the thump of a hammer flashes up
// notes on either side for a moment, and the overtones of ringing notes come and go faintly. A note counts once per
// strike: not again for a quarter of a second.
class StrikeFinder {
  constructor() {
    this.recent = []; // the last three readings, oldest first: Map(pitch class -> power)
    this.lastStrike = new Map(); // pitch class -> time
    this.pending = []; // notes that have just started, waiting to be confirmed: { pc, midi, t }
  }

  // notes: [{ midi, strength, power }] from detectNotes; t: the time in seconds -> [{ midi, strength, t }]
  feed(notes, t) {
    const now = new Map();
    for (const n of notes) {
      const pc = n.midi % 12;
      if (!now.has(pc) || now.get(pc).power < n.power) now.set(pc, n);
    }
    const strikes = [];
    this.pending = this.pending.filter((p) => {
      const n = now.get(p.pc);
      if (n && n.strength >= CLEAR) {
        strikes.push({ midi: p.midi, strength: n.strength, t: p.t });
        this.lastStrike.set(p.pc, p.t);
        return false;
      }
      return t - p.t < 0.13; // two readings
    });
    for (const [pc, n] of now) {
      const before = Math.max(0, ...this.recent.slice(0, 2).map((r) => r.get(pc) || 0));
      const last = this.lastStrike.has(pc) ? this.lastStrike.get(pc) : -Infinity;
      if (n.power >= before * RISE && t - last > 0.25 && !this.pending.some((p) => p.pc === pc)) {
        this.pending.push({ pc, midi: n.midi, t });
      }
    }
    this.recent.push(new Map([...now].map(([pc, n]) => [pc, n.power])));
    if (this.recent.length > 3) this.recent.shift();
    return strikes;
  }
}

/* ---------- The microphone ---------- */

// Listens to the microphone. Every 60 ms or so: onFrame([{ midi, strength, power }]) with the notes sounding together,
// and onStrike({ midi, strength, t }) for each key just struck. onLevel(0 to 1) feeds a level meter. quiet(seconds)
// ignores what it hears for a moment while the page itself plays a sound, so it doesn't answer for you.
class Listener {
  constructor({ onFrame, onStrike, onLevel }) {
    Object.assign(this, { onFrame, onStrike, onLevel, deafUntil: 0 });
  }

  async start() {
    // no echo cancelling, noise removal or automatic volume: they are made for voices and smear musical notes
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 8192; // the newest 170 ms
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.room = new RoomLevel();
    this.tuning = new Tuning();
    this.strikes = new StrikeFinder();
    this.lastReading = 0;
    this.timer = setInterval(() => this.tick(), 20);
  }

  stop() {
    clearInterval(this.timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = null;
    this.ctx = null;
  }

  quiet(seconds) {
    this.deafUntil = Math.max(this.deafUntil, performance.now() + seconds * 1000);
  }

  tick() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    const level = rms(this.buffer, this.buffer.length - 1024);
    this.onLevel(Math.min(1, Math.max(0, (20 * Math.log10(level + 1e-9) + 60) / 50))); // -60 dB to -10 dB
    const loud = this.room.loud(level);
    const now = performance.now();
    if (now - this.lastReading < 60) return;
    this.lastReading = now;
    const notes = loud ? detectNotes(this.buffer, this.ctx.sampleRate, this.tuning, now >= this.deafUntil) : [];
    // the strike finder hears the page's own sounds too, so it knows what is already ringing; they just don't count
    const strikes = this.strikes.feed(notes, now / 1000);
    if (now < this.deafUntil) return;
    this.onFrame(notes);
    strikes.forEach(this.onStrike);
  }
}
