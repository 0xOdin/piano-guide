const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, Barline, FretHandFinger, Modifier } = Vex.Flow;

const INK = "#1c1b19";
const W = 440;
const $ = (id) => document.getElementById(id);
const slug = (name) => name.replace("♯", "-sharp").replace("♭", "-flat").toLowerCase();


const state = { i: 0, hands: "both", tempo: 450, fingers: "on" };

let steps = [];
let timers = [];
let playing = false;
let audioCtx, master;


const bassOctave = (scale) => (scale.semis[0] >= 3 ? 2 : 3);


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

    if (showFingers) opts.stem_direction = hand === "rh" ? 1 : -1;
    const note = new StaveNote(opts);

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


function drawScore(el, scale, { hands = "both", fingers = true } = {}) {
  el.innerHTML = "";
  const both = hands === "both";
  const H = both ? 250 : 150;
  const keyName = scale.name.replace("♯", "#").replace("♭", "b");

  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(W, H);
  const ctx = renderer.getContext();
  ctx.setFillStyle(INK);
  ctx.setStrokeStyle(INK);

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
    [StaveConnector.type.BRACE, StaveConnector.type.SINGLE_LEFT, StaveConnector.type.BOLD_DOUBLE_RIGHT]
      .forEach((type) => new StaveConnector(jobs[0].stave, jobs[1].stave).setType(type).setContext(ctx).draw());
  }

  const svg = el.querySelector("svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");

  svg.style.removeProperty("width");
  svg.style.removeProperty("height");


  let view = `0 0 ${W} ${H}`;
  try {
    const box = svg.getBBox();
    const pad = 8;
    view = `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`;
  } catch (e) {}
  svg.setAttribute("viewBox", view);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `${scale.name} major scale, one octave ascending. Notes: ${scale.notes.join(" ")}.`);


  const groups = [...svg.querySelectorAll(".vf-stavenote")];
  return Array.from({ length: 8 }, (_, n) => jobs.map((_, k) => groups[k * 8 + n]));
}

/* Viewer */

function renderViewer() {
  stopPlayback();
  const s = MAJOR_SCALES[state.i];

  $("scale-title").textContent = `${s.name} major`;
  $("scale-alt").hidden = !s.alt;
  if (s.alt) $("scale-alt").textContent = `Also written as ${s.alt.name} major: ${s.alt.notes.join(" ")}`;
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

/* Sound */

function tone(semi, t, length) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 261.63 * Math.pow(2, semi / 12);
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
  if (master) { master.disconnect(); master = null; }
  playing = false;
  $("play-btn").textContent = "▶ Play scale";
}

function playScale() {
  if (playing) return stopPlayback();
  const s = MAJOR_SCALES[state.i];
  audioCtx = audioCtx || new AudioContext();
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

/* Page setup */

$("scale-tabs").innerHTML = MAJOR_SCALES.map(
  (s, i) => `<button type="button" data-i="${i}">${s.name}</button>`
).join("");

$("scale-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.i = Number(b.dataset.i);
  renderViewer();
});


document.querySelectorAll(".seg").forEach((seg) =>
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state[seg.dataset.key] = seg.dataset.key === "tempo" ? Number(b.dataset.v) : b.dataset.v;
    renderViewer();
  })
);

$("play-btn").addEventListener("click", playScale);
renderViewer();


$("scale-list").innerHTML = MAJOR_SCALES.map((s) => `
  <article class="scale-card" id="${slug(s.name)}">
    <h3>${s.name} major</h3>
    <div class="score"></div>
    <p class="fingering-line"><strong>Right hand:</strong> ${s.rh.join(" ")}</p>
    <p class="fingering-line"><strong>Left hand:</strong> ${s.lh.join(" ")}</p>
  </article>`).join("");

document.querySelectorAll("#scale-list .score").forEach((el, i) => drawScore(el, MAJOR_SCALES[i]));