// The piano's sound on the site: a recording of a real Steinway for every key from C2 to C6, made by
// scripts/make-sounds.js into /assets/piano/ (36.m4a ... 84.m4a, by MIDI number). The recordings are about 1.4 MB in
// all, so they come in two parts: the octave from middle C (where most first notes are) once the page has loaded and
// is idle, and the rest when the visitor first does something on the page (a click, a tap, a key), the middle of the
// keyboard first. A page only read never fetches more than that octave. Until a note's recording is ready, or if the
// browser can't play it, a soft made-up tone stands in. Notes beyond C2 to C6 use the nearest recording, played faster
// or slower. Used by keyboard.js and practice.js.
//
// playPiano(abs, { delay, length, hold }) plays a note (abs: semitones from middle C) `delay` seconds from now, damps it
// after `length` seconds as a key let go without the pedal, and returns a function that damps it at once (for a key
// that is let go), or cancels it if it hasn't started yet. With `hold` it rings until that function is called.

const PIANO_FOLDER = new URL("../assets/piano/", document.currentScript.src); // works in any folder of the site
const PIANO_LOWEST = 36; // C2
const PIANO_HIGHEST = 84; // C6
const piano = { ctx: null, master: null, files: new Map(), buffers: new Map() };

// Fetched and unpacked ahead of the first note, so it already sounds like a piano. An offline audio context unpacks
// them: unlike the one that plays, it needs no click first, and what it unpacks can be played by any context.
// `which` (optional) picks the notes (MIDI numbers); each is only fetched once.
let unpacker = null;
function fetchPianoSounds(which = null) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return;
  unpacker = unpacker || new Offline(1, 1, 44100);
  const notes = [];
  for (let midi = PIANO_LOWEST; midi <= PIANO_HIGHEST; midi++) {
    if (!piano.files.has(midi) && (!which || which.includes(midi))) notes.push(midi);
  }
  notes.sort((a, b) => Math.abs(a - 66) - Math.abs(b - 66));
  for (const midi of notes) {
    const file = fetch(new URL(`${midi}.m4a`, PIANO_FOLDER))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((data) => new Promise((done, fail) => unpacker.decodeAudioData(data, done, fail)))
      .then((buffer) => piano.buffers.set(midi, buffer))
      .catch(() => {}); // this note keeps the made-up tone
    piano.files.set(midi, file);
  }
}

const MIDDLE_OCTAVE = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]; // C4 to C5
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1000));
const saveData = navigator.connection && navigator.connection.saveData; // the visitor asked to use less data
if (!saveData) {
  if (document.readyState === "complete") whenIdle(() => fetchPianoSounds(MIDDLE_OCTAVE));
  else window.addEventListener("load", () => whenIdle(() => fetchPianoSounds(MIDDLE_OCTAVE)));
}
const fetchTheRest = () => {
  ["pointerup", "keydown"].forEach((type) => window.removeEventListener(type, fetchTheRest, true));
  fetchPianoSounds();
};
// pointerup, not pointerdown: a finger that only scrolls the page lifts with pointercancel, and fetches nothing
["pointerup", "keydown"].forEach((type) => window.addEventListener(type, fetchTheRest, { capture: true, passive: true }));

// The audio itself is set up on the first note: browsers only allow sound after a click or a key
function pianoAudio() {
  if (!piano.ctx) {
    piano.ctx = new (window.AudioContext || window.webkitAudioContext)();
    piano.master = piano.ctx.createGain();
    piano.master.gain.value = 0.9;
    const limiter = piano.ctx.createDynamicsCompressor(); // keeps big chords from distorting
    piano.master.connect(limiter).connect(piano.ctx.destination);
    fetchPianoSounds();
  }
  if (piano.ctx.state === "suspended") piano.ctx.resume();
  return piano;
}

// the recording to play for a note: its own, or the nearest one within a fifth (a note beyond the recordings is
// played from the end one)
function nearestRecording(midi) {
  if (piano.buffers.has(midi)) return midi;
  const target = Math.max(PIANO_LOWEST, Math.min(PIANO_HIGHEST, midi));
  for (let d = 0; d <= 7; d++) {
    if (piano.buffers.has(target - d)) return target - d;
    if (piano.buffers.has(target + d)) return target + d;
  }
  return null;
}

function playPiano(abs, { delay = 0, length = 0.8, hold = false } = {}) {
  const { ctx, master } = pianoAudio();
  const midi = abs + 60;
  const from = nearestRecording(midi);
  const t = ctx.currentTime + delay;
  const env = ctx.createGain();
  env.connect(master);
  let sources;
  if (from !== null) {
    const src = ctx.createBufferSource();
    src.buffer = piano.buffers.get(from);
    src.playbackRate.value = Math.pow(2, (midi - from) / 12);
    src.connect(env);
    src.start(t);
    sources = [src];
  } else {
    // the made-up tone: a triangle wave with a quieter sine an octave above, fading away like a struck string
    const freq = 261.63 * Math.pow(2, abs / 12); // 261.63 Hz = middle C
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (hold ? 6 : length));
    sources = [["triangle", 1, 1], ["sine", 2, 0.25]].map(([type, mult, level]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * mult;
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      return osc;
    });
  }
  // the damper: the string falls silent in a tenth of a second, as on a piano when the key comes up
  const damp = (at) => {
    env.gain.cancelScheduledValues(at);
    env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    sources.forEach((s) => s.stop(at + 0.12));
  };
  if (!hold) {
    if (from !== null) damp(t + length);
    else sources.forEach((s) => s.stop(t + length + 0.05)); // the made-up tone has faded by then
  }
  // let go: damped now, or if it hasn't started yet, it never sounds
  return () => {
    if (ctx.currentTime < t) {
      sources.forEach((s) => s.stop());
      env.disconnect();
    } else {
      damp(ctx.currentTime);
    }
  };
}
