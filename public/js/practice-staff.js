// Sheet music for the practice page (/practice/): a question's chord, interval or scale, drawn with VexFlow. VexFlow
// is about 1 MB, so it is only fetched the first time sheet music is wanted (from /js/vendor/, beside this file).
// Uses readNote from practice-music.js.

const VEXFLOW_URL = new URL("vendor/vexflow.js", document.currentScript.src);
const STAFF_INK = "#121316";
const STAFF_SCALE = 1.4; // shown a little larger than drawn, when there is room
const STAFF_MIN = 0.8; // and never smaller than this: the music goes on to another line first
let vexflowLoading = null;

// Loads VexFlow once. Resolves true when it is there, false if it couldn't be fetched (offline, before it was kept).
function loadVexflow() {
  if (typeof Vex !== "undefined") return Promise.resolve(true);
  if (!vexflowLoading) {
    vexflowLoading = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = VEXFLOW_URL;
      script.onload = () => resolve(typeof Vex !== "undefined");
      script.onerror = () => {
        vexflowLoading = null; // can be tried again later
        script.remove();
        resolve(false);
      };
      document.head.append(script);
    });
  }
  return vexflowLoading;
}

const staffAccidental = (d) => (d > 0 ? "#".repeat(d) : "b".repeat(-d));

// Draws `groups` into `el`, left to right: each group is one note, or a chord (notes { name, abs }, lowest first) as
// a whole note, every sharp and flat written. `clef`: "treble" or "bass". `fit` (optional): the width there is, in
// pixels; music that doesn't fit goes on to more lines. `label`: for screen readers.
function drawStaff(el, groups, { clef = "treble", fit = Infinity, label = "" } = {}) {
  const { Renderer, Stave, StaveNote, Voice, Formatter, Barline, Accidental } = Vex.Flow;
  el.innerHTML = "";

  // each line starts with the clef, then has room for each note or chord, so the music isn't cramped against the
  // bar lines
  const staveFor = (y, width, last) => new Stave(10, y, width).addClef(clef)
    .setEndBarType(last ? Barline.type.END : Barline.type.SINGLE);
  const perGroup = groups.length === 1 ? 130 : groups.some((g) => g.length > 1) ? 80 : 56;
  const head = staveFor(0, 400, true).getNoteStartX() - 10;
  // as many on a line as fit, shown no smaller than STAFF_MIN, then the lines as even as they go (3, 2, 2, not 3, 3, 1)
  const fits = Math.max(1, Math.floor((fit / STAFF_MIN - 36 - head) / perGroup));
  const lines = Math.ceil(groups.length / fits);
  const sizes = Array.from({ length: lines }, (_, l) => Math.floor(groups.length / lines) + (l < groups.length % lines ? 1 : 0));
  const width = head + sizes[0] * perGroup + 16;
  const LINE = 110; // from one line to the next
  const W = width + 20;
  const H = 50 + lines * LINE;

  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(W, H);
  const ctx = renderer.getContext();
  ctx.setFillStyle(STAFF_INK);
  ctx.setStrokeStyle(STAFF_INK);

  let from = 0;
  for (let l = 0; l < lines; l++) {
    const part = groups.slice(from, from + sizes[l]);
    from += sizes[l];
    const last = l === lines - 1;
    const stave = staveFor(30 + l * LINE, width, last); // every line as long as the first, as in printed music
    if (groups.length === 1) stave.setNoteStartX(stave.getNoteStartX() + perGroup / 2 - 22); // a chord alone sits in the middle of its bar
    stave.setContext(ctx).draw();

    const tickables = [];
    part.forEach((group) => {
      const notes = group.map((n) => ({ ...readNote(n.name), abs: n.abs }));
      // the octave comes from the natural note underneath any sharp or flat (C♭5 sits where C5 does)
      const keys = notes.map((n) => `${n.letter.toLowerCase()}${n.d ? staffAccidental(n.d) : ""}/${4 + Math.floor((n.abs - n.d) / 12)}`);
      const note = new StaveNote({ clef, keys, duration: "w" });
      notes.forEach((n, j) => {
        if (n.d) note.addModifier(new Accidental(staffAccidental(n.d)), j);
      });
      tickables.push(note);
    });
    const voice = new Voice({ num_beats: 4, beat_value: 4 }).setMode(Voice.Mode.SOFT).addTickables(tickables);
    new Formatter().joinVoices([voice]).format([voice], Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - perGroup / 2));
    voice.draw(ctx, stave);
  }

  // crop the drawing to what was drawn, and show it a little larger than drawn (as wide as it is, or the screen)
  const svg = el.querySelector("svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.removeProperty("height"); // VexFlow sets an inline size, which beats the CSS
  let view = `0 0 ${W} ${H}`;
  let viewW = W;
  try {
    const box = svg.getBBox();
    const pad = 8;
    view = `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`;
    viewW = box.width + pad * 2;
  } catch (e) { /* if measuring fails, keep the full drawing */ }
  svg.setAttribute("viewBox", view);
  svg.style.width = `${Math.round(viewW * STAFF_SCALE)}px`;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
}
