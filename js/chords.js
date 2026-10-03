// Piano chords page. Drawn with VexFlow (loaded from a CDN before this file) plus a keyboard diagram.
// Top of the page: an interactive viewer (pick a root and a chord type, then hand, inversion and play style).
// Bottom of the page: every chord type on the chosen root, written out for reference.
const { Renderer, Stave, StaveNote, Voice, Formatter, Barline, Accidental } = Vex.Flow;

const INK = "#1c1b19";
const $ = (id) => document.getElementById(id);

// what the viewer is currently showing
const state = { root: 0, type: 0, inv: 0, hands: "rh", style: "block" };

let current = []; // the notes being shown, lowest first
let timers = [];
let playing = false;
let audioCtx, master;

/* ---------- Sheet music ---------- */

// Draws one chord (a whole note) on a single stave.
function drawStaff(el, notes, hand, label) {
  el.innerHTML = "";
  const clef = hand === "lh" ? "bass" : "treble";
  const W = 170;
  const H = 170;

  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(W, H);
  const ctx = renderer.getContext();
  ctx.setFillStyle(INK);
  ctx.setStrokeStyle(INK);

  const stave = new Stave(10, 55, W - 20).addClef(clef);
  stave.setEndBarType(Barline.type.END);
  stave.setContext(ctx).draw();

  // keys are written lowest first; the octave comes from the natural note underneath any sharp or flat
  const keys = notes.map((n) => {
    const octave = 4 + Math.floor((n.abs - n.d) / 12);
    const acc = n.d > 0 ? "#".repeat(n.d) : "b".repeat(-n.d);
    return `${n.letter.toLowerCase()}${acc}/${octave}`;
  });
  const chord = new StaveNote({ clef, keys, duration: "w" });
  notes.forEach((n, i) => {
    if (n.d !== 0 && Math.abs(n.d) <= 2) {
      chord.addModifier(new Accidental(n.d > 0 ? "#".repeat(n.d) : "b".repeat(-n.d)), i);
    }
  });

  const voice = new Voice({ num_beats: 4, beat_value: 4 }).setMode(Voice.Mode.SOFT).addTickables([chord]);
  const formatter = new Formatter().joinVoices([voice]);
  formatter.format([voice], Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - 30));
  voice.draw(ctx, stave);

  const svg = el.querySelector("svg");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  // VexFlow also sets an inline style (width / height in px), which beats the CSS.
  svg.style.removeProperty("width");
  svg.style.removeProperty("height");

  // Crop the drawing to what was actually drawn, so no space is wasted around it.
  let view = `0 0 ${W} ${H}`;
  try {
    const box = svg.getBBox();
    const pad = 8;
    view = `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`;
  } catch (e) { /* if measuring fails, keep the full drawing */ }
  svg.setAttribute("viewBox", view);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${label}. Notes from lowest to highest: ${notes.map((n) => n.name).join(" ")}.`);
}

/* ---------- Keyboard diagram ---------- */

// Two octaves of keys: C4 to B5 for the right hand, C3 to B4 for the left. The notes of the chord are filled in,
// with the finger number on each one and the root a darker colour.
function keyboardSVG(notes, fingers, hand, label) {
  const KW = 24, KH = 120, BW = 14, BH = 74;
  const start = hand === "lh" ? -12 : 0;
  const marks = new Map(notes.map((n, i) => [n.abs, { finger: fingers[i], root: n.root }]));

  let whites = "";
  let blacks = "";
  let w = 0; // white keys drawn so far
  for (let k = 0; k < 24; k++) {
    const s = start + k;
    const pc = ((s % 12) + 12) % 12;
    const m = marks.get(s);
    const cls = (m ? " on" : "") + (m && m.root ? " root" : "");
    if (NATURAL_SEMIS.includes(pc)) {
      const x = w * KW;
      const finger = m ? `<text class="finger" x="${x + KW / 2}" y="${KH - 34}">${m.finger}</text>` : "";
      const octave = pc === 0 ? `<text class="octave" x="${x + KW / 2}" y="${KH - 8}">C${4 + Math.floor(s / 12)}</text>` : "";
      whites += `<g class="white${cls}" data-abs="${s}"><rect x="${x + 0.5}" y="-6" width="${KW - 1}" height="${KH + 5}" rx="3"/>${finger}${octave}</g>`;
      w++;
    } else {
      const x = w * KW - BW / 2; // a black key sits on the line between two white keys
      const finger = m ? `<text class="finger" x="${x + BW / 2}" y="${BH - 14}">${m.finger}</text>` : "";
      blacks += `<g class="black${cls}" data-abs="${s}"><rect x="${x}" y="-6" width="${BW}" height="${BH + 6}" rx="2"/>${finger}</g>`;
    }
  }
  return `<svg class="kb" viewBox="0 0 ${w * KW} ${KH}" role="img" aria-label="${label}">${whites}${blacks}</svg>`;
}

/* ---------- Viewer ---------- */

function renderViewer() {
  stopPlayback();
  const root = CHORD_ROOTS[state.root];
  const type = CHORD_TYPES[state.type];
  const tones = spellChord(root, type);
  state.inv = Math.min(state.inv, tones.length - 1);

  const notes = voiceChord(tones, state.inv, state.hands);
  current = notes;
  const fingers = FINGERING[tones.length][state.hands][state.inv];
  const title = `${root.name} ${type.name}`;
  const symbol = chordSymbol(root, type);
  const bass = notes[0].name;

  $("chord-title").textContent = title;

  // symbol and formula, plus the other spelling when it needs no double sharps or flats
  let meta = `Symbol: ${symbol} · Formula: ${type.tones.map((t) => t[2]).join(" ")}`;
  if (root.alt) {
    const altTones = spellChord(root.alt, type);
    if (altTones.every((t) => Math.abs(t.d) <= 1)) {
      meta += ` · Also written as ${root.alt.name} ${type.name}: ${altTones.map((t) => t.name).join(" ")}`;
    }
  }
  $("chord-meta").textContent = meta;

  $("chord-notes").innerHTML = notes.map((n) => `<li>${n.name}<small>${n.label}</small></li>`).join("");

  $("inv-seg").innerHTML = tones.map((_, i) =>
    `<button type="button" data-v="${i}">${["Root", "1st", "2nd", "3rd"][i]}</button>`).join("");

  const label = `${title}, ${INVERSION_NAMES[state.inv].toLowerCase()}, ${state.hands === "rh" ? "right" : "left"} hand`;
  drawStaff($("chord-score"), notes, state.hands, label);
  $("chord-keys").innerHTML = keyboardSVG(notes, fingers, state.hands, `${label}, shown on the keyboard`);

  const handName = state.hands === "rh" ? "Right hand" : "Left hand";
  const bassText = state.inv === 0 ? bass : `${bass} (written ${symbol}/${bass})`;
  $("fingering-text").innerHTML =
    `<p><strong>${INVERSION_NAMES[state.inv]}</strong></p>` +
    `<p><strong>${handName}:</strong> ${fingers.join(" ")}</p>` +
    `<p><strong>Bass note:</strong> ${bassText}</p>`;

  document.querySelectorAll("#root-tabs button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === state.root)));
  document.querySelectorAll("#type-tabs button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === state.type)));
  document.querySelectorAll(".seg").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", String(String(state[seg.dataset.key]) === b.dataset.v))));
}

/* ---------- Sound ---------- */

function tone(semi, t, length, peak) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const end = t + Math.max(length * 1.6, 0.5);
  osc.type = "triangle";
  osc.frequency.value = 261.63 * Math.pow(2, semi / 12); // 261.63 Hz = middle C
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(end + 0.05);
}

const keyGroups = (abs) => document.querySelectorAll(`#chord-keys g[data-abs="${abs}"]`);

function stopPlayback() {
  timers.forEach(clearTimeout);
  timers = [];
  document.querySelectorAll("#chord-keys .is-playing").forEach((e) => e.classList.remove("is-playing"));
  if (master) { master.disconnect(); master = null; } // cuts off any notes still ringing
  playing = false;
  $("play-btn").textContent = "▶ Play chord";
}

function playChord() {
  if (playing) return stopPlayback();
  audioCtx = audioCtx || new AudioContext(); // must be created after a click
  if (audioCtx.state === "suspended") audioCtx.resume();
  master = audioCtx.createGain();
  master.connect(audioCtx.destination);

  const spread = state.style === "spread";
  const gap = spread ? 0.32 : 0; // seconds between notes when spread out
  const hold = 1.3;
  const peak = 0.34 / Math.sqrt(current.length); // keeps four notes from being louder than three

  current.forEach((n, i) => {
    tone(n.abs, audioCtx.currentTime + 0.05 + i * gap, hold, peak);
    timers.push(setTimeout(() => keyGroups(n.abs).forEach((g) => g.classList.add("is-playing")), 50 + i * gap * 1000));
  });
  const total = 50 + ((current.length - 1) * gap + hold) * 1000;
  timers.push(setTimeout(stopPlayback, total));
  playing = true;
  $("play-btn").textContent = "■ Stop";
}

/* ---------- Reference list ---------- */

// every chord type on the chosen root, right hand, root position
function renderList() {
  const root = CHORD_ROOTS[state.root];
  $("list-title").textContent = `All chords on ${root.name}`;

  const groups = [["Triads", "triad"], ["Seventh chords", "seventh"]];
  $("chord-list").innerHTML = groups.map(([title, group]) => `
    <div class="chord-group">
      <h3 class="group-title">${title}</h3>
      <div class="scale-list">
        ${CHORD_TYPES.map((t, i) => [t, i]).filter(([t]) => t.group === group).map(([t, i]) => {
          const names = spellChord(root, t).map((n) => n.name);
          return `
        <article class="scale-card chord-card">
          <h3>${root.name} ${t.name}</h3>
          <div class="score chord-score" data-t="${i}"></div>
          <p class="fingering-line"><strong>Symbol:</strong> ${chordSymbol(root, t)}</p>
          <p class="fingering-line"><strong>Notes:</strong> ${names.join(" ")}</p>
          <p class="fingering-line"><strong>Formula:</strong> ${t.tones.map((x) => x[2]).join(" ")}</p>
        </article>`;
        }).join("")}
      </div>
    </div>`).join("");

  document.querySelectorAll("#chord-list .score").forEach((el) => {
    const t = CHORD_TYPES[Number(el.dataset.t)];
    drawStaff(el, voiceChord(spellChord(root, t), 0, "rh"), "rh", `${root.name} ${t.name}`);
  });
}

/* ---------- Page setup ---------- */

$("root-tabs").innerHTML = CHORD_ROOTS.map((r, i) =>
  `<button type="button" data-i="${i}">${r.alt ? (r.name.includes("♯") ? `${r.name}/${r.alt.name}` : `${r.alt.name}/${r.name}`) : r.name}</button>`).join("");

// the first seventh chord starts a new group
$("type-tabs").innerHTML = CHORD_TYPES.map((t, i) => {
  const first = t.group === "seventh" && CHORD_TYPES[i - 1].group === "triad";
  return `<button type="button" data-i="${i}"${first ? ' class="tab-break"' : ""}>${t.tab}</button>`;
}).join("");

$("root-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.root = Number(b.dataset.i);
  renderViewer();
  renderList();
});

$("type-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.type = Number(b.dataset.i);
  renderViewer();
});

// every option group (.seg) has data-key="hands" | "inv" | "style"
document.querySelector(".options").addEventListener("click", (e) => {
  const b = e.target.closest(".seg button");
  if (!b) return;
  const key = b.closest(".seg").dataset.key;
  state[key] = key === "inv" ? Number(b.dataset.v) : b.dataset.v;
  renderViewer();
});

$("play-btn").addEventListener("click", playChord);
renderViewer();
renderList();