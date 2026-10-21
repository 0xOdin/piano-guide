// Makes the piano sounds the site plays (public/assets/piano/36.m4a ... 84.m4a, C2 to C6, named by MIDI number) from
// the recordings in recordings/: a Steinway played at medium loudness, from the University of Iowa Electronic Music
// Studios (theremin.music.uiowa.edu/MISpiano.html), "may be downloaded and used for any projects, without
// restrictions". The recordings are about 300 MB and not in git; the sounds are about 1 MB and are.
//
// Each sound starts the moment the key is struck, lasts 3.2 seconds and fades out over the last 0.8, is one channel,
// and is brought to the same loudness as the others. It is saved as AAC (.m4a), which every current browser plays.
//
// Run it with   node scripts/make-sounds.js   after changing the recordings or the settings below. It needs macOS: it
// uses the afconvert program that comes with it to make the AAC files.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { readAiff } = require("./aiff.js");

const ROOT = path.join(__dirname, "..");
const IN = path.join(ROOT, "recordings");
const OUT = path.join(ROOT, "public", "assets", "piano");
const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LOWEST = 36; // C2
const HIGHEST = 84; // C6
const SECONDS = 3.2;
const FADE = 0.8; // seconds of fade at the end
const LOUDNESS = 0.12; // rms over the first 0.4 seconds
const MOST = 0.9; // highest sample

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "piano-sounds-"));
fs.mkdirSync(OUT, { recursive: true });

function writeWav(file, samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8, "ascii");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // one channel
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "ascii");
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

let total = 0;
for (let midi = LOWEST; midi <= HIGHEST; midi++) {
  const name = `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
  const { samples, sampleRate } = readAiff(path.join(IN, `Piano.mf.${name}.aiff`));

  // the strike: the first sample above 5% of the loudest, less 5 ms so the hammer's attack is kept whole
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < peak * 0.05) start++;
  start = Math.max(0, start - Math.round(0.005 * sampleRate));

  const length = Math.min(Math.round(SECONDS * sampleRate), samples.length - start);
  const sound = samples.slice(start, start + length);
  let sum = 0;
  const early = Math.min(sound.length, Math.round(0.4 * sampleRate));
  for (let i = 0; i < early; i++) sum += sound[i] * sound[i];
  const loudest = sound.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const gain = Math.min(LOUDNESS / Math.sqrt(sum / early), MOST / loudest);
  const fade = Math.round(FADE * sampleRate);
  for (let i = 0; i < sound.length; i++) {
    const left = sound.length - i;
    sound[i] *= gain * (left < fade ? 0.5 - 0.5 * Math.cos((Math.PI * left) / fade) : 1);
  }

  const wav = path.join(tmp, `${midi}.wav`);
  const m4a = path.join(OUT, `${midi}.m4a`);
  writeWav(wav, sound, Math.round(sampleRate));
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", wav, m4a]);
  total += fs.statSync(m4a).size;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Made ${HIGHEST - LOWEST + 1} sounds in public/assets/piano/ (${Math.round(total / 1024)} KB)`);
