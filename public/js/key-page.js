// Key pages (scale, arpeggio, chord). The fingering at the top of the page is already in the HTML, written by
// scripts/build.js. This script adds the interactive part: the key signature beside the heading and the sheet music,
// drawn with VexFlow (loaded from a CDN before this file), keyboard diagrams with the keys and finger numbers marked,
// and the sound: the note chips under the heading and the Play button on the keyboard card use the recorded piano
// (piano-sound.js), lighting each key and note as it sounds. The keyboards are drawn by piano-keys.js.
// The notes arrive as JSON in <script id="page-data">:
//   { mode: "melodic", octaves: { 1: { notes, rh, lh }, 2: { ... } } }   scale and arpeggio
//   { mode: "melodic", start, variants: { <start>: { name, octaves } } }    chromatic scale: one set of notes for each
//                                                                          starting note, picked with the "Start on" buttons
//   { mode: "chord", inversions: [ ... ] }                               chord
const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, Barline, FretHandFinger, Modifier, Accidental } = Vex.Flow;

const INK = "#121316";
const $ = (id) => document.getElementById(id);
const data = JSON.parse($("page-data").textContent);

const NATURAL_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // semitone of C D E F G A B

const accidental = (d) => (d > 0 ? "#".repeat(d) : "b".repeat(-d));
const vexKey = (n, octave) => `${n.letter.toLowerCase()}${accidental(n.d)}/${octave}`;

// Crops a finished VexFlow drawing to what was actually drawn, so no space is wasted around it.
// `minScale` (optional): the drawing is never shown smaller than this fraction of its natural size. On a narrow
// screen it scrolls sideways instead (the .score box allows that), so a long line of notes stays readable.
function fitSvg(el, W, H, label, minScale) {
  const svg = el.querySelector("svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  // VexFlow also sets an inline style (width / height in px), which beats the CSS.
  svg.style.removeProperty("width");
  svg.style.removeProperty("height");

  let view = `0 0 ${W} ${H}`;
  let viewW = W;
  try {
    const box = svg.getBBox();
    const pad = 8;
    view = `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`;
    viewW = box.width + pad * 2;
  } catch (e) { /* if measuring fails, keep the full drawing */ }
  svg.setAttribute("viewBox", view);
  if (minScale) svg.style.minWidth = `${Math.round(viewW * minScale)}px`;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  return svg;
}

// Marks the buttons that match the current settings. The same setting can appear in several sections
// (for example the octaves switch), so every group with that key is updated.
function setAriaPressed(state) {
  document.querySelectorAll(".seg, .pills").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", String(String(state[seg.dataset.key]) === b.dataset.v))));
}

// Passes every click on an option button to `onChange(key, value)`. Settings that are numbers are converted.
function listenForOptions(onChange) {
  const NUMBERS = ["octaves", "inv"];
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".seg button, .pills button");
    if (!b) return;
    const key = b.closest(".seg, .pills").dataset.key;
    onChange(key, NUMBERS.includes(key) ? Number(b.dataset.v) : b.dataset.v);
  });
}

// A keyboard (piano-keys.js, the same keys as the homepage's), starting at the C below the lowest note and running
// past the highest: at least two octaves, ending on a white key. The keys of the scale, arpeggio or chord are lit and
// the finger number is written on each of them (when `showFingers` is on).
// marks: [{ abs, finger }], where abs is the semitone from middle C (0 = C4).
// `range` (optional): the keys to show instead, { from, to } (see keysBelow).
function keyboardFor(marks, showFingers, label, range = keysFrom(marks)) {
  return pianoKeysHTML({ ...range, marks, showFingers, label });
}

const isWhite = (abs) => NATURAL_SEMIS.includes(((abs % 12) + 12) % 12);
const whitesIn = ({ from, to }) => Array.from({ length: to - from + 1 }, (_, i) => from + i).filter(isWhite).length;

// the usual keys: from the C below the lowest note, at least two octaves, ending on a white key
function keysFrom(marks) {
  const all = marks.map((m) => m.abs);
  const from = Math.floor(Math.min(...all) / 12) * 12;
  let to = Math.max(from + 23, Math.max(...all));
  while (!isWhite(to)) to++;
  return { from, to };
}

// The same number of white keys, but ending just above the highest note, so the empty keys are on the left. For the
// left hand's keyboard when it sits to the left of the right hand's: the two hands' notes then meet in the middle,
// as on the piano.
function keysBelow(marks, whites) {
  const all = marks.map((m) => m.abs);
  let to = Math.max(...all);
  while (!isWhite(to)) to++;
  let from = to;
  let count = 1;
  while (count < whites || from > Math.min(...all) || !isWhite(from)) {
    from--;
    if (isWhite(from)) count++;
  }
  return { from, to };
}

/* =====================================================================================
   The hero: the key signature beside the heading, and the notes to tap
   ===================================================================================== */

// The key signature on a small grand staff. The staves are only as long as the clef and signature need.
function drawSignature() {
  const el = $("hero-sig");
  if (!el) return;
  const sig = el.dataset.sig;
  const staves = (width) => ["treble", "bass"].map((clef, i) => {
    const stave = new Stave(24, i * 64, width).addClef(clef);
    if (!["C", "Am"].includes(sig)) stave.addKeySignature(sig);
    return stave;
  });
  const width = staves(400)[0].getNoteStartX() - 24 + 14; // the clef and signature, and a little room after them
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(width + 40, 150);
  const ctx = renderer.getContext();
  ctx.setFillStyle(INK);
  ctx.setStrokeStyle(INK);
  const [treble, bass] = staves(width);
  [treble, bass].forEach((stave) => stave.setContext(ctx).draw());
  [StaveConnector.type.BRACE, StaveConnector.type.SINGLE_LEFT, StaveConnector.type.SINGLE_RIGHT]
    .forEach((type) => new StaveConnector(treble, bass).setType(type).setContext(ctx).draw());
  fitSvg(el, width + 40, 150, el.getAttribute("aria-label"));
  el.removeAttribute("aria-label"); // the drawing carries it now
}

// The note chips: each sounds when tapped
function listenToChips() {
  document.querySelectorAll(".note-chip").forEach((chip) => chip.addEventListener("click", () => {
    playPiano(Number(chip.dataset.abs), { length: 0.9 });
    chip.classList.add("is-sounding");
    setTimeout(() => chip.classList.remove("is-sounding"), 350);
  }));
}

/* =====================================================================================
   Playing what the keyboards show (the Play button at the foot of the keyboard card)
   ===================================================================================== */

const STEP = 0.32; // seconds from one note of a scale or arpeggio to the next; each note stops as the next starts
const player = { timers: [], damps: [], lit: [] };

function setPlayButton(playing) {
  const b = $("play-score");
  b.classList.toggle("is-playing", playing);
  b.querySelector("span").textContent = playing ? "Stop" : "Play";
  document.documentElement.classList.toggle("score-playing", playing); // keys.css shows only the key sounding in red
}

function unlight() {
  player.lit.forEach((el) => el.classList.remove("is-sounding"));
  player.lit = [];
}

function stopPlaying() {
  player.timers.forEach(clearTimeout);
  player.timers = [];
  player.damps.forEach((damp) => damp());
  player.damps = [];
  unlight();
  setPlayButton(false);
}

// Plays `steps` in turn: [{ at, length, notes: [abs], light: [elements] }], `at` and `length` in seconds. Each step
// sounds its notes together and lights its elements (keys and noteheads) until the next step.
function playSteps(steps) {
  stopPlaying();
  setPlayButton(true);
  steps.forEach((step) => player.timers.push(setTimeout(() => {
    unlight();
    player.damps = step.notes.map((abs) => playPiano(abs, { length: step.length }));
    step.light().forEach((el) => {
      el.classList.add("is-sounding");
      player.lit.push(el);
    });
  }, step.at * 1000)));
  const last = steps[steps.length - 1];
  player.timers.push(setTimeout(() => {
    unlight();
    player.timers = [];
    player.damps = [];
    setPlayButton(false);
  }, (last.at + Math.min(last.length, 0.8)) * 1000));
}

// a key on one hand's keyboard
const keyEl = (hand, abs) => document.querySelector(`.kb-block[data-hand="${hand}"] [data-abs="${abs}"]`);
// a note or chord in the sheet music, drawn by VexFlow
const noteEl = (note) => (note && note.getSVGElement && note.getSVGElement()) || null;

/* =====================================================================================
   Scale and arpeggio: a row of notes, one octave or two, one hand or both
   ===================================================================================== */

// The fingering table, written the same way build.js writes it (used when the chromatic scale changes its start note)
function fingerTableHTML(notes, rh, lh) {
  const head = notes.map((n) => `<th scope="col">${n.name}</th>`).join("");
  const row = (label, title, fingers) =>
    `<tr><th scope="row"><abbr title="${title}">${label}</abbr></th>${fingers.map((f) => `<td${f === 1 ? ' class="thumb"' : ""}>${f}</td>`).join("")}</tr>`;
  return `<table class="finger-grid" style="--cols:${notes.length}"><thead><tr><th scope="col"><span class="sr-only">Hand</span></th>${head}</tr></thead><tbody>${row("RH", "Right hand", rh)}${row("LH", "Left hand", lh)}</tbody></table>`;
}

function runMelodic() {
  const state = { hands: "both", fingers: "on", octaves: 1 };
  if (data.variants) {
    // chromatic scale: the notes depend on the start note chosen with the buttons
    state.start = data.start;
    data.octaves = data.variants[state.start].octaves;
    data.name = data.variants[state.start].name;
  }
  const view = () => data.octaves[state.octaves]; // { notes, rh, lh } for the octaves shown

  // left hand starts lower for most keys, so the notes stay near the staff
  const bassOctave = () => (data.octaves[1].notes[0].abs >= 3 ? 2 : 3);
  // the semitone a note is at, for each hand (the left hand sits lower, as on the staff)
  // octaveShift (keys-data.js) can move a hand up or down by whole octaves
  const shiftOf = (hand) => (data.octaveShift && data.octaveShift[hand]) || 0;
  const handAbs = (hand, n) => (hand === "lh" ? n.abs - 12 * (4 - bassOctave()) : n.abs) + 12 * shiftOf(hand);
  const shownHands = () => (state.hands === "both" ? ["rh", "lh"] : [state.hands]);
  let scoreNotes = {}; // the notes drawn in the sheet music, for each hand

  // the notes from `from` up to (not including) `to`, for one hand
  function buildNotes(hand, clef, baseOctave, showFingers, from, to) {
    const v = view();
    return v.notes.slice(from, to).map((n, j) => {
      const octave = baseOctave + Math.floor((n.abs - n.d) / 12);
      const opts = { clef, keys: [vexKey(n, octave)], duration: "q" };
      // with finger numbers shown, stems point away from them (right hand up, left hand down)
      if (showFingers) opts.stem_direction = hand === "rh" ? 1 : -1;
      const note = new StaveNote(opts);
      if (showFingers) {
        note.addModifier(
          new FretHandFinger(String(v[hand][from + j]))
            .setPosition(hand === "rh" ? Modifier.Position.BELOW : Modifier.Position.ABOVE),
          0
        );
      }
      return note;
    });
  }

  // The whole scale is one line of music, one octave or two. On a narrow phone a two-octave line scrolls sideways
  // (see fitSvg) rather than shrinking the notes.
  function draw() {
    const el = $("main-score");
    el.innerHTML = "";
    const v = view();
    const total = v.notes.length;
    const hands = shownHands();
    const both = hands.length === 2;
    const showFingers = state.fingers === "on";
    el.dataset.hands = both ? "both" : "one"; // keys.css limits the height by this

    const H = both ? 260 : 150;
    const W = Math.max(300, 150 + total * 40); // drawing width; CSS scales the SVG to fit the screen

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(W, H);
    const ctx = renderer.getContext();
    ctx.setFillStyle(INK);
    ctx.setStrokeStyle(INK);

    // arpeggios have no key signature (keySig is null): every sharp and flat is written by its note
    const keySig = data.keySig || "C";

    const jobs = hands.map((hand) => {
      const treble = hand === "rh";
      const clef = treble ? "treble" : "bass";
      const y = treble ? 40 : (both ? 150 : 50);
      const stave = new Stave(28, y, W - 48).addClef(clef);
      if (keySig !== "C") stave.addKeySignature(keySig);
      return { stave, notes: buildNotes(hand, clef, (treble ? 4 : bassOctave()) + shiftOf(hand), showFingers, 0, total) };
    });

    // line the notes up vertically when both staves are shown
    const startX = Math.max(...jobs.map((j) => j.stave.getNoteStartX()));
    jobs.forEach((j) => {
      j.stave.setNoteStartX(startX);
      j.stave.setEndBarType(Barline.type.END);
      j.stave.setContext(ctx).draw();
    });

    const voices = jobs.map((j) =>
      new Voice({ num_beats: total, beat_value: 4 }).setMode(Voice.Mode.SOFT).addTickables(j.notes)
    );
    voices.forEach((voice) => Accidental.applyAccidentals([voice], keySig));

    const formatter = new Formatter();
    voices.forEach((voice) => formatter.joinVoices([voice]));
    formatter.format(voices, jobs[0].stave.getNoteEndX() - startX - 16);

    voices.forEach((voice, k) => voice.draw(ctx, jobs[k].stave));
    scoreNotes = Object.fromEntries(hands.map((hand, k) => [hand, jobs[k].notes]));

    if (both) {
      // join the two staves into a grand staff
      [StaveConnector.type.BRACE, StaveConnector.type.SINGLE_LEFT, StaveConnector.type.BOLD_DOUBLE_RIGHT]
        .forEach((type) => new StaveConnector(jobs[0].stave, jobs[1].stave).setType(type).setContext(ctx).draw());
    }

    const octaveText = state.octaves === 2 ? "two octaves" : "one octave";
    fitSvg(el, W, H, `${data.name}, ${octaveText} ascending. Notes: ${v.notes.map((n) => n.name).join(" ")}.`,
      state.octaves === 2 ? 0.62 : 0);
  }

  // one keyboard per hand shown, with the finger numbers on the keys
  // One keyboard per hand shown, with the finger numbers on the keys. Where the two sit side by side (a scale on a
  // desktop, keys.css), the left hand's keyboard keeps its empty keys on the left, so the hands meet in the middle.
  const sideBySide = window.matchMedia("(min-width: 1024px)");
  function drawKeyboards() {
    const v = view();
    const showFingers = state.fingers === "on";
    const marksOf = (hand) => v.notes.map((n, i) => ({ abs: handAbs(hand, n), finger: v[hand][i], name: n.name }));
    const split = shownHands().length === 2 && sideBySide.matches && !document.querySelector(".practice-pair-arp");
    $("keyboards").innerHTML = shownHands().map((hand) => {
      const side = hand === "rh" ? "Right hand" : "Left hand";
      const marks = marksOf(hand);
      const range = split && hand === "lh" ? keysBelow(marks, whitesIn(keysFrom(marksOf("rh")))) : keysFrom(marks);
      return `<div class="kb-block" data-hand="${hand}"><span class="option-label">${side}</span><div id="kb-${hand}" class="piano-fit">${keyboardFor(marks, showFingers, `${data.name}, ${side.toLowerCase()}, shown on the keyboard`, range)}</div></div>`;
    }).join("");
  }
  sideBySide.addEventListener("change", () => {
    stopPlaying();
    drawKeyboards();
  });

  // the fingering table at the top of the page: the one-octave table or the two-octave tables
  function showFingeringTable() {
    document.querySelectorAll(".finger-view").forEach((el) => {
      el.hidden = el.dataset.octaves !== String(state.octaves);
    });
  }

  // a new start note for the chromatic scale: new notes, and a new fingering table (the page has the first one)
  function chooseStart() {
    data.octaves = data.variants[state.start].octaves;
    data.name = data.variants[state.start].name;
    document.querySelectorAll(".finger-view").forEach((el) => {
      const o = data.octaves[el.dataset.octaves];
      el.querySelector(".finger-scroll").innerHTML = fingerTableHTML(o.notes, o.rh, o.lh);
    });
  }

  function render() {
    showFingeringTable();
    draw();
    drawKeyboards();
    setAriaPressed(state);
  }

  // Play: up and back down, with the hands shown and the octaves chosen. Melodic minor comes down as the natural
  // minor (data.down); those notes are not in the sheet music, which shows the way up, so only their keys light.
  function play() {
    const v = view();
    const top = v.notes.length - 1;
    const down = data.down && data.down[state.octaves];
    const order = [...v.notes.keys(), ...[...v.notes.keys()].reverse().slice(1)];
    playSteps(order.map((i, k) => {
      const abs = k > top && down ? down[i] : v.notes[i].abs;
      const written = abs === v.notes[i].abs;
      const notes = shownHands().map((hand) => ({ hand, abs: handAbs(hand, { abs }) }));
      return {
        at: k * STEP,
        length: k === order.length - 1 ? 1 : STEP,
        notes: notes.map((n) => n.abs),
        light: () => [...notes.map((n) => keyEl(n.hand, n.abs)), ...notes.map((n) => written && noteEl(scoreNotes[n.hand][i]))].filter(Boolean),
      };
    }));
  }

  $("play-score").addEventListener("click", () => ($("play-score").classList.contains("is-playing") ? stopPlaying() : play()));
  listenForOptions((key, value) => {
    stopPlaying();
    state[key] = value;
    if (key === "start") chooseStart();
    render();
  });
  render();
}

/* =====================================================================================
   Chord: the notes together, as sheet music and on a keyboard
   ===================================================================================== */

function runChord() {
  const state = { hands: "both", inv: 0 };
  const SIDE = { rh: "Right hand", lh: "Left hand" };
  let current = []; // the notes being shown, one entry per hand: { hand, notes, fingers }, each lowest note first
  let scoreChords = {}; // the chord drawn in the sheet music, for each hand

  // Draws the chord as one whole note on a single stave, or on a grand staff when both hands are shown.
  function drawStaff(parts, label) {
    const el = $("chord-score");
    el.innerHTML = "";
    const both = parts.length === 2;
    const W = 200;
    const H = both ? 250 : 170;

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(W, H);
    const ctx = renderer.getContext();
    ctx.setFillStyle(INK);
    ctx.setStrokeStyle(INK);

    const jobs = parts.map(({ hand, notes }) => {
      const clef = hand === "lh" ? "bass" : "treble";
      const y = both ? (hand === "rh" ? 30 : 130) : 55;
      const stave = new Stave(28, y, W - 48).addClef(clef);
      stave.setEndBarType(Barline.type.END);
      // the octave comes from the natural note underneath any sharp or flat
      const keys = notes.map((n) => vexKey(n, 4 + Math.floor((n.abs - n.d) / 12)));
      return { stave, chord: new StaveNote({ clef, keys, duration: "w" }) };
    });

    // line the chords up when both staves are shown
    const startX = Math.max(...jobs.map((j) => j.stave.getNoteStartX()));
    jobs.forEach((j) => {
      j.stave.setNoteStartX(startX);
      j.stave.setContext(ctx).draw();
    });

    const voices = jobs.map((j) =>
      new Voice({ num_beats: 4, beat_value: 4 }).setMode(Voice.Mode.SOFT).addTickables([j.chord])
    );
    voices.forEach((voice) => Accidental.applyAccidentals([voice], "C"));
    const formatter = new Formatter();
    voices.forEach((voice) => formatter.joinVoices([voice]));
    formatter.format(voices, Math.max(40, jobs[0].stave.getNoteEndX() - startX - 30));
    voices.forEach((voice, k) => voice.draw(ctx, jobs[k].stave));
    scoreChords = Object.fromEntries(parts.map(({ hand }, k) => [hand, jobs[k].chord]));

    if (both) {
      [StaveConnector.type.BRACE, StaveConnector.type.SINGLE_LEFT, StaveConnector.type.BOLD_DOUBLE_RIGHT]
        .forEach((type) => new StaveConnector(jobs[0].stave, jobs[1].stave).setType(type).setContext(ctx).draw());
    }

    const spoken = parts.map(({ hand, notes }) => `${SIDE[hand].toLowerCase()}: ${notes.map((n) => n.name).join(" ")}`).join("; ");
    fitSvg(el, W, H, `${label}. Notes from lowest to highest, ${spoken}.`);
  }

  function render() {
    const inv = data.inversions[state.inv];
    const hands = state.hands === "both" ? ["rh", "lh"] : [state.hands];
    current = hands.map((hand) => ({ hand, notes: inv[hand].notes, fingers: inv[hand].fingers }));

    const handText = state.hands === "both" ? "both hands" : SIDE[state.hands].toLowerCase();
    const label = `${data.name} chord, ${inv.label.toLowerCase()}, ${handText}`;
    drawStaff(current, label);

    // one keyboard per hand shown, like the scale pages
    $("chord-keys").innerHTML = current.map(({ hand, notes, fingers }) => {
      const marks = notes.map((n, i) => ({ abs: n.abs, finger: fingers[i], name: n.name }));
      const kbLabel = `${data.name} chord, ${inv.label.toLowerCase()}, ${SIDE[hand].toLowerCase()}, shown on the keyboard`;
      return `<div class="kb-block" data-hand="${hand}"><span class="option-label">${SIDE[hand]}</span><div class="piano-fit">${keyboardFor(marks, true, kbLabel)}</div></div>`;
    }).join("");

    $("inv-seg").innerHTML = data.inversions.map((v, i) =>
      `<button type="button" data-v="${i}">${["Root", "1st", "2nd"][i]}</button>`).join("");
    setAriaPressed(state);
  }

  // Play: the chord as shown, both hands together
  function play() {
    playSteps([{
      at: 0,
      length: 1.6,
      notes: current.flatMap(({ notes }) => notes.map((n) => n.abs)),
      light: () => current.flatMap(({ hand, notes }) => [...notes.map((n) => keyEl(hand, n.abs)), noteEl(scoreChords[hand])]).filter(Boolean),
    }]);
  }

  $("play-score").addEventListener("click", () => ($("play-score").classList.contains("is-playing") ? stopPlaying() : play()));
  listenForOptions((key, value) => {
    stopPlaying();
    state[key] = value;
    render();
  });
  render();
}

drawSignature();
listenToChips();
// the menu of keys beside the tabs: the same kind of page in the key chosen
const keySwitch = $("key-switch");
if (keySwitch) keySwitch.addEventListener("change", () => { location.href = keySwitch.value; });
if (data.mode === "chord") runChord();
else runMelodic();
