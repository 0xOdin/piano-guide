// Sheet music for the major scales, drawn with VexFlow (loaded from a CDN before this file).
// Top of the page: an interactive viewer (pick a key, hands, tempo, fingering, play).
// Bottom of the page: all 12 scales written out for reference.
const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, Barline, FretHandFinger, Modifier, Accidental } = Vex.Flow;

// The minor page also loads minor-data.js, which defines MINOR_SCALES (natural / harmonic / melodic).
const IS_MINOR = typeof MINOR_SCALES !== "undefined";
const getScales = (type) => (IS_MINOR ? MINOR_SCALES[type] : MAJOR_SCALES);
// "C major"  |  "C harmonic minor"
const scaleName = (name, type) => (IS_MINOR ? `${name} ${type} minor` : `${name} major`);

const INK = "#1c1b19";
const W = 440; // drawing width; CSS scales the SVG to fit the screen
const $ = (id) => document.getElementById(id);
const slug = (name) => name.replace("♯", "-sharp").replace("♭", "-flat").toLowerCase();

// what the viewer is currently showing
const state = { i: 0, type: "natural", hands: "both", tempo: 450, fingers: "on" };

let steps = [];          // steps[n] = the note elements to light up on beat n
let timers = [];
let playing = false;
let audioCtx, master;

// left hand starts lower for most keys, so the notes stay near the staff
const bassOctave = (scale) => (scale.semis[0] >= 3 ? 2 : 3);

// "F♯" -> letter "f", d = +1  |  "B♭" -> letter "b", d = -1
function parseNote(note) {
  const d = (note.match(/♯/g) || []).length - (note.match(/♭/g) || []).length;
  return { letter: note[0].toLowerCase(), d };
}

function buildNotes(scale, hand, clef, baseOctave, showFingers) {
  return scale.notes.map((n, i) => {
    const { letter, d } = parseNote(n);
    const octave = baseOctave + Math.floor((scale.semis[i] - d) / 12);
    const acc = d > 0 ? "#".repeat(d) : "b".repeat(-d);
    const opts = { clef, keys: [`${letter}${acc}/${octave}`], duration: "q" };
    // with finger numbers shown, stems point away from them (right hand up, left hand down)
    if (showFingers) opts.stem_direction = hand === "rh" ? 1 : -1;
    const note = new StaveNote(opts);

    // Minor scales: the key signature is the natural minor, so a raised 6th or 7th needs its own accidental
    // (a natural sign when it cancels a flat from the key signature).
    if (scale.keyNotes) {
      const keyD = parseNote(scale.keyNotes.find((k) => k[0].toLowerCase() === letter)).d;
      if (d !== keyD) note.addModifier(new Accidental(d > 0 ? "#".repeat(d) : d < 0 ? "b".repeat(-d) : "n"), 0);
    }

    if (showFingers) {
      note.addModifier(
        new FretHandFinger(String(scale[hand][i]))
          .setPosition(hand === "rh" ? Modifier.Position.BELOW : Modifier.Position.ABOVE),
        0
      );
    }
    return note;
  });
}

// Draws one scale into `el`. Returns, for each of the 8 beats, the SVG groups of the notes on it.
function drawScore(el, scale, { hands = "both", fingers = true, type = state.type } = {}) {
  el.innerHTML = "";
  const both = hands === "both";
  const H = both ? 250 : 150;
  const keyName = scale.keyName || scale.name.replace("♯", "#").replace("♭", "b");

  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(W, H);
  const ctx = renderer.getContext();
  ctx.setFillStyle(INK);
  ctx.setStrokeStyle(INK);

  // A major scale needs no accidentals on the notes: the key signature carries them all.
  // (Minor scales add the few they need in buildNotes.)
  const jobs = [];
  if (hands !== "lh") {
    jobs.push({
      stave: new Stave(28, 40, 392).addClef("treble").addKeySignature(keyName),
      notes: buildNotes(scale, "rh", "treble", 4, fingers),
    });
  }
  if (hands !== "rh") {
    jobs.push({
      stave: new Stave(28, both ? 140 : 50, 392).addClef("bass").addKeySignature(keyName),
      notes: buildNotes(scale, "lh", "bass", bassOctave(scale), fingers),
    });
  }

  // line the notes up vertically when both staves are shown
  const startX = Math.max(...jobs.map((j) => j.stave.getNoteStartX()));
  jobs.forEach((j) => {
    j.stave.setNoteStartX(startX);
    j.stave.setEndBarType(Barline.type.END);
    j.stave.setContext(ctx).draw();
  });

  const voices = jobs.map((j) =>
    new Voice({ num_beats: 8, beat_value: 4 }).setMode(Voice.Mode.SOFT).addTickables(j.notes)
  );
  const formatter = new Formatter();
  voices.forEach((v) => formatter.joinVoices([v]));
  formatter.format(voices, jobs[0].stave.getNoteEndX() - startX - 16);
  voices.forEach((v, k) => v.draw(ctx, jobs[k].stave));

  if (both) {
    // join the two staves into a grand staff
    [StaveConnector.type.BRACE, StaveConnector.type.SINGLE_LEFT, StaveConnector.type.BOLD_DOUBLE_RIGHT]
      .forEach((type) => new StaveConnector(jobs[0].stave, jobs[1].stave).setType(type).setContext(ctx).draw());
  }

  const svg = el.querySelector("svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  // VexFlow also sets an inline style (width: 440px; height: 250px), which beats the CSS.
  svg.style.removeProperty("width");
  svg.style.removeProperty("height");

  // Crop the drawing to what was actually drawn, so no space is wasted around it.
  // getBBox() measures the drawn shapes; the padding covers line thickness.
  let view = `0 0 ${W} ${H}`;
  try {
    const box = svg.getBBox();
    const pad = 8;
    view = `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`;
  } catch (e) { /* if measuring fails, keep the full drawing */ }
  svg.setAttribute("viewBox", view);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `${scaleName(scale.name, type)} scale, one octave ascending. Notes: ${scale.notes.join(" ")}.`);

  // VexFlow wraps each note in <g class="vf-stavenote">, drawn voice by voice
  const groups = [...svg.querySelectorAll(".vf-stavenote")];
  return Array.from({ length: 8 }, (_, n) => jobs.map((_, k) => groups[k * 8 + n]));
}

/* ---------- Viewer ---------- */

function renderViewer() {
  stopPlayback();
  const s = getScales(state.type)[state.i];

  $("scale-title").textContent = scaleName(s.name, state.type);
  $("scale-alt").hidden = !s.alt;
  if (s.alt) $("scale-alt").textContent = `Also written as ${scaleName(s.alt.name, state.type)}: ${s.alt.notes.join(" ")}`;
  $("scale-notes").innerHTML = s.notes.map((n) => `<li>${n}</li>`).join("");

  steps = drawScore($("main-score"), s, { hands: state.hands, fingers: state.fingers === "on" });

  const lines = [];
  if (state.hands !== "lh") lines.push(`<strong>Right hand:</strong> ${s.rh.join(" ")}`);
  if (state.hands !== "rh") lines.push(`<strong>Left hand:</strong> ${s.lh.join(" ")}`);
  $("fingering-text").innerHTML = lines.map((l) => `<p>${l}</p>`).join("");

  document.querySelectorAll("#scale-tabs button").forEach((b, i) =>
    b.setAttribute("aria-pressed", String(i === state.i)));
  document.querySelectorAll(".seg").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", String(String(state[seg.dataset.key]) === b.dataset.v))));
}

/* ---------- Sound ---------- */

function tone(semi, t, length) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 261.63 * Math.pow(2, semi / 12); // 261.63 Hz = middle C
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + Math.max(length * 1.6, 0.5));
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + Math.max(length * 1.6, 0.5) + 0.05);
}

function highlight(n) {
  document.querySelectorAll("#main-score .is-playing").forEach((e) => e.classList.remove("is-playing"));
  (steps[n] || []).forEach((g) => g && g.classList.add("is-playing"));
}

function stopPlayback() {
  timers.forEach(clearTimeout);
  timers = [];
  document.querySelectorAll("#main-score .is-playing").forEach((e) => e.classList.remove("is-playing"));
  if (master) { master.disconnect(); master = null; } // cuts off any notes still ringing
  playing = false;
  $("play-btn").textContent = "▶ Play scale";
}

function playScale() {
  if (playing) return stopPlayback();
  const s = getScales(state.type)[state.i];
  audioCtx = audioCtx || new AudioContext(); // must be created after a click
  if (audioCtx.state === "suspended") audioCtx.resume();
  master = audioCtx.createGain();
  master.connect(audioCtx.destination);

  const hands = state.hands === "both" ? ["rh", "lh"] : [state.hands];
  const step = state.tempo / 1000;
  s.semis.forEach((semi, n) => {
    const t = audioCtx.currentTime + 0.05 + n * step;
    hands.forEach((h) => tone(h === "lh" ? semi - 12 * (4 - bassOctave(s)) : semi, t, step));
    timers.push(setTimeout(() => highlight(n), 50 + n * state.tempo));
  });
  timers.push(setTimeout(stopPlayback, 50 + 8 * state.tempo + 300));
  playing = true;
  $("play-btn").textContent = "■ Stop";
}

/* ---------- Page setup ---------- */

$("scale-tabs").innerHTML = getScales(state.type).map(
  (s, i) => `<button type="button" data-i="${i}">${s.name}</button>`
).join("");

$("scale-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.i = Number(b.dataset.i);
  renderViewer();
});

// every option group (.seg) has data-key="hands" | "tempo" | "fingers"
document.querySelectorAll(".seg").forEach((seg) =>
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state[seg.dataset.key] = seg.dataset.key === "tempo" ? Number(b.dataset.v) : b.dataset.v;
    renderViewer();
    if (seg.dataset.key === "type") renderList();
  })
);

$("play-btn").addEventListener("click", playScale);
renderViewer();

// the reference list: all 12 scales, both hands, always visible
// (on the minor page it follows the Type buttons: natural, harmonic or melodic)
function renderList() {
  const list = getScales(state.type);
  if ($("list-title")) $("list-title").textContent = `All 12 ${state.type} minor scales`;

  $("scale-list").innerHTML = list.map((s) => `
    <article class="scale-card" id="${slug(s.name)}">
      <h3>${scaleName(s.name, state.type)}</h3>
      <div class="score"></div>
      <p class="fingering-line"><strong>Right hand:</strong> ${s.rh.join(" ")}</p>
      <p class="fingering-line"><strong>Left hand:</strong> ${s.lh.join(" ")}</p>
    </article>`).join("");

  document.querySelectorAll("#scale-list .score").forEach((el, i) => drawScore(el, list[i]));
}

renderList();