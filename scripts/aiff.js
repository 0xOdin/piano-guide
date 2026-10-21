// Reads an AIFF file (the format of the piano recordings in recordings/) into plain numbers: the sound as one channel
// of samples from -1 to 1, and its sample rate. Only what those files use: uncompressed 8, 16, 24 or 32-bit samples.
// Used by scripts/make-sounds.js.
const fs = require("fs");

// The sample rate is stored as an 80-bit floating point number
function extended(buf, at) {
  const exp = ((buf[at] & 0x7f) << 8) | buf[at + 1];
  const hi = buf.readUInt32BE(at + 2);
  const lo = buf.readUInt32BE(at + 6);
  return (hi * 2 ** 32 + lo) * 2 ** (exp - 16383 - 63) * (buf[at] & 0x80 ? -1 : 1);
}

// -> { samples: Float32Array (the channels mixed into one), sampleRate, channels, seconds }
function readAiff(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "FORM" || buf.toString("ascii", 8, 12) !== "AIFF") throw new Error(`${file}: not an AIFF file`);
  let channels = 0;
  let frames = 0;
  let bits = 0;
  let sampleRate = 0;
  let data = -1;
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString("ascii", at, at + 4);
    const size = buf.readUInt32BE(at + 4);
    if (id === "COMM") {
      channels = buf.readInt16BE(at + 8);
      frames = buf.readUInt32BE(at + 10);
      bits = buf.readInt16BE(at + 14);
      sampleRate = extended(buf, at + 16);
    } else if (id === "SSND") {
      data = at + 16 + buf.readUInt32BE(at + 8); // after the offset and block size fields
    }
    at += 8 + size + (size % 2); // chunks are padded to an even length
  }
  if (!channels || data < 0) throw new Error(`${file}: no sound in it`);
  const bytes = Math.ceil(bits / 8);
  const full = 2 ** (bits - 1);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += buf.readIntBE(data + (i * channels + c) * bytes, bytes);
    samples[i] = sum / channels / full;
  }
  return { samples, sampleRate, channels, seconds: frames / sampleRate };
}

module.exports = { readAiff };
