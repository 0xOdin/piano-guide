// Key pages (scale, arpeggio, chord). The fingering at the top of the page is already in the HTML, written by
// scripts/build.js. This script adds the interactive part underneath: sheet music drawn with VexFlow (loaded from a
// CDN before this file) and keyboard diagrams with the keys and finger numbers marked.
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

// A piano keyboard, starting at the C below the lowest note and running past the highest. The keys are plain
// white and black like a real piano. The keys of the scale, arpeggio or chord are marked (class is-marked, coloured
// in keys.css) and the finger number is written on each of them (when `showFingers` is on).
// marks: [{ abs, finger }], where abs is the semitone from middle C (0 = C4).
function keyboardSVG(marks, showFingers, label) {
  const KW = 24, KH = 104, BW = 14, BH = 64;
  const MIN_KEY = 18; // narrowest a white key is drawn, in px; wider keyboards scroll sideways on a phone
  const all = marks.map((m) => m.abs);
  const start = Math.floor(Math.min(...all) / 12) * 12;
  let end = Math.max(start + 23, Math.max(...all)); // at least two octaves
  while (!NATURAL_SEMIS.includes(((end % 12) + 12) % 12)) end++; // finish on a white key
  const byKey = new Map(marks.map((m) => [m.abs, m]));

  let whites = "";
  let blacks = "";
  let w = 0; // white keys drawn so far
  for (let s = start; s <= end; s++) {
    const pc = ((s % 12) + 12) % 12;
    const m = byKey.get(s);
    const finger = (x, y) => (m && showFingers ? `<text class="finger" x="${x}" y="${y}">${m.finger}</text>` : "");
    if (NATURAL_SEMIS.includes(pc)) {
      const x = w * KW;
      const octave = pc === 0 ? `<text class="octave" x="${x + KW / 2}" y="${KH - 8}">C${4 + Math.floor(s / 12)}</text>` : "";
      whites += `<g class="white${m ? " is-marked" : ""}"><rect x="${x + 0.5}" y="-6" width="${KW - 1}" height="${KH + 5}" rx="3"/>${finger(x + KW / 2, KH - 30)}${octave}</g>`;
      w++;
    } else {
      const x = w * KW - BW / 2; // a black key sits on the line between two white keys
      blacks += `<g class="black${m ? " is-marked" : ""}"><rect x="${x}" y="-6" width="${BW}" height="${BH + 6}" rx="2"/>${finger(x + BW / 2, BH - 12)}</g>`;
    }
  }
  return `<svg class="kb" viewBox="0 0 ${w * KW} ${KH}" style="min-width:${w * MIN_KEY}px" role="img" aria-label="${label}">${whites}${blacks}</svg>`;
}

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
  function drawKeyboards() {
    const v = view();
    const showFingers = state.fingers === "on";
    $("keyboards").innerHTML = shownHands().map((hand) => {
      const side = hand === "rh" ? "Right hand" : "Left hand";
      const marks = v.notes.map((n, i) => ({ abs: handAbs(hand, n), finger: v[hand][i] }));
      return `<div class="kb-block"><span class="option-label">${side}</span><div id="kb-${hand}">${keyboardSVG(marks, showFingers, `${data.name}, ${side.toLowerCase()}, shown on the keyboard`)}</div></div>`;
    }).join("");
  }

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

  listenForOptions((key, value) => {
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
      const marks = notes.map((n, i) => ({ abs: n.abs, finger: fingers[i] }));
      const kbLabel = `${data.name} chord, ${inv.label.toLowerCase()}, ${SIDE[hand].toLowerCase()}, shown on the keyboard`;
      return `<div class="kb-block"><span class="option-label">${SIDE[hand]}</span><div>${keyboardSVG(marks, true, kbLabel)}</div></div>`;
    }).join("");

    $("inv-seg").innerHTML = data.inversions.map((v, i) =>
      `<button type="button" data-v="${i}">${["Root", "1st", "2nd"][i]}</button>`).join("");
    setAriaPressed(state);
  }

  listenForOptions((key, value) => {
    state[key] = value;
    render();
  });
  render();
}

if (data.mode === "chord") runChord();
else runMelodic();
