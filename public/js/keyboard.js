// The interactive keyboard (/keyboard/): two octaves, C4 to C6, drawn as buttons.
//  - Click, tap or use the computer keys to play. Clicked keys stay selected (click again to let go). The readout
//    names the selected keys together with any computer keys held down: a note, an interval or a chord.
//  - "Show" lights up a scale, arpeggio or chord of any key with its fingering. The notes and fingers come from
//    <script id="keyboard-data">, written by scripts/build.js from the same data as the key pages.
//  - The sound is a recorded piano (piano-sound.js); Mute turns it off.
// Uses CHORD_ROOTS, CHORD_TYPES, INVERSION_NAMES, spellTone and spellChord from chords-data.js.

const $ = (id) => document.getElementById(id);
const KEYS = JSON.parse($("keyboard-data").textContent);

const LOW = 0; // C4 (0 = middle C)
const HIGH = 24; // C6
const pc = (abs) => ((abs % 12) + 12) % 12;
const isBlack = (abs) => ![0, 2, 4, 5, 7, 9, 11].includes(pc(abs));
const noteName = (abs) => CHORD_ROOTS[pc(abs)].name; // the black keys are D♭ E♭ F♯ A♭ B♭
const withOctave = (abs) => `${noteName(abs)}${4 + Math.floor(abs / 12)}`;

// the computer keys, from the C they start on: the home row plays the white keys, the row above the black keys
const COMPUTER_KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"];
const OCTAVES = [0, 12]; // the computer keys start on C4 or C5 (Z and X switch)

const state = { show: "none", key: KEYS[0].slug, form: "natural", hand: "rh", muted: false, octave: 0 };
const selected = new Set(); // clicked keys
const held = new Map(); // computer keys held down: letter -> { abs, release }
const flashing = new Set(); // keys lit for a moment by the Play button
let playTimers = [];

/* ---------- Sound ---------- */

// The piano's sound (piano-sound.js). `hold`: keep sounding until the returned function is called, for a computer
// key held down.
function sound(abs, { delay = 0, length = 0.8, hold = false } = {}) {
  if (state.muted) return () => {};
  return playPiano(abs, { delay, length, hold });
}

/* ---------- Naming the notes pressed ---------- */

// [name, letters above the lower note] by semitones (0 to 11)
const INTERVALS = [
  ["Unison", 0], ["Minor 2nd", 1], ["Major 2nd", 1], ["Minor 3rd", 2], ["Major 3rd", 2], ["Perfect 4th", 3],
  ["Augmented 4th", 3], ["Perfect 5th", 4], ["Minor 6th", 5], ["Major 6th", 5], ["Minor 7th", 6], ["Major 7th", 6],
];

function nameInterval(lo, hi) {
  const d = hi - lo;
  const octaves = Math.floor(d / 12);
  const [name, letters] = INTERVALS[d % 12];
  const root = CHORD_ROOTS[pc(lo)];
  const upper = spellTone(root.letter, root.semi, letters + 1, d % 12).name; // C to E♭, not C to D♯
  const title = d % 12 === 0 ? (octaves === 1 ? "Octave" : `${octaves} octaves`)
    : `${name}${octaves ? ` plus ${octaves === 1 ? "an octave" : `${octaves} octaves`}` : ""}`;
  return { title, detail: `${root.name} to ${upper} · ${d} semitone${d === 1 ? "" : "s"}` };
}

// Tries every chord type in chords-data.js, on the lowest note first, then on each of the others.
function nameChord(notes) {
  const pcs = [...new Set(notes.map(pc))];
  const bass = pc(notes[0]);
  for (const r of [bass, ...pcs.filter((p) => p !== bass)]) {
    for (const type of CHORD_TYPES) {
      if (type.tones.length !== pcs.length) continue;
      const chord = type.tones.map(([, semis]) => (r + semis) % 12);
      if (!pcs.every((p) => chord.includes(p))) continue;
      const root = CHORD_ROOTS[r];
      return {
        title: `${root.name} ${type.name} chord`,
        detail: `${spellChord(root, type).map((t) => t.name).join(" ")} · ${INVERSION_NAMES[chord.indexOf(bass)].toLowerCase()}`,
      };
    }
  }
  return { title: notes.map(noteName).join(" "), detail: "Not one of the common chords" };
}

function describe(keys) {
  const notes = [...new Set(keys)].sort((a, b) => a - b);
  const pcs = new Set(notes.map(pc));
  if (notes.length === 1) return { title: withOctave(notes[0]), detail: "One note" };
  if (pcs.size === 1) return { title: noteName(notes[0]), detail: `The same note in ${notes.length} octaves` };
  if (pcs.size === 2) { // an interval, perhaps with a note doubled
    const second = notes.find((n) => pc(n) !== pc(notes[0]));
    return nameInterval(notes[0], notes.length === 2 ? notes[1] : second);
  }
  return nameChord(notes);
}

/* ---------- What "Show" lights up ---------- */

function currentShow() {
  if (state.show === "none") return null;
  const key = KEYS.find((k) => k.slug === state.key) || KEYS[0];
  const root = key.name.split(" ")[0];
  const d = state.show === "scale" ? key.scale[key.minor ? state.form : "major"] : key[state.show];
  const label = state.show === "scale" && key.minor ? `${root} ${state.form} minor scale` : `${key.name} ${state.show}`;
  return { key, label, notes: d.notes, fingers: d[state.hand], url: d.url };
}

/* ---------- Drawing ---------- */

const keyEls = new Map(); // abs -> button

function drawPiano() {
  const whiteCount = [...Array(HIGH - LOW + 1).keys()].filter((i) => !isBlack(LOW + i)).length;
  const w = 100 / whiteCount; // width of a white key, in %
  let html = "";
  let whites = 0;
  for (let abs = LOW; abs <= HIGH; abs++) {
    const black = isBlack(abs);
    // a black key sits on the line between two white keys
    const style = black ? ` style="left:${(whites * w - w * 0.31).toFixed(3)}%;width:${(w * 0.62).toFixed(3)}%"` : "";
    html += `<button type="button" class="pkey ${black ? "black" : "white"}" data-abs="${abs}" aria-label="${withOctave(abs)}" aria-pressed="false"${style}>`
      + `<span class="pkey-finger"></span><span class="pkey-name"></span><span class="pkey-hint" aria-hidden="true"></span></button>`;
    if (!black) whites++;
  }
  $("piano").innerHTML = html;
  $("piano").querySelectorAll(".pkey").forEach((el) => keyEls.set(Number(el.dataset.abs), el));
}

function render() {
  const show = currentShow();
  const shown = new Map(show ? show.notes.map((n, i) => [n.abs, { name: n.name, finger: show.fingers[i] }]) : []);
  const down = new Set([...[...held.values()].map((h) => h.abs), ...flashing]);

  keyEls.forEach((el, abs) => {
    const s = shown.get(abs);
    const isSelected = selected.has(abs);
    el.classList.toggle("is-shown", !!s);
    el.classList.toggle("is-selected", isSelected);
    el.classList.toggle("is-down", down.has(abs));
    el.setAttribute("aria-pressed", String(isSelected));
    el.querySelector(".pkey-finger").textContent = s ? s.finger : "";
    el.querySelector(".pkey-name").textContent = s ? s.name
      : isSelected || down.has(abs) ? noteName(abs)
      : pc(abs) === 0 ? withOctave(abs) : "";
    const i = abs - state.octave;
    el.querySelector(".pkey-hint").textContent = i >= 0 && i < COMPUTER_KEYS.length ? COMPUTER_KEYS[i].toUpperCase() : "";
  });

  // the readout: what is pressed, or else what is shown
  const pressed = [...selected, ...[...held.values()].map((h) => h.abs)];
  const text = pressed.length ? describe(pressed)
    : show ? { title: show.label, detail: `${state.hand === "rh" ? "Right" : "Left"} hand: ${show.fingers.join(" ")}` }
    : { title: "Play a few keys", detail: "The note, interval or chord you play is named here." };
  $("readout").innerHTML = "";
  const title = document.createElement("strong");
  title.className = "kb-name";
  title.textContent = text.title;
  const detail = document.createElement("span");
  detail.className = "kb-detail";
  detail.textContent = text.detail;
  $("readout").append(title, detail);

  // options that only apply to some choices
  const key = KEYS.find((k) => k.slug === state.key);
  $("key-option").hidden = !show;
  $("hand-option").hidden = !show;
  $("form-option").hidden = !(show && state.show === "scale" && key.minor);
  $("key-select").value = state.key;
  document.querySelectorAll(".kb-options .seg").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(state[seg.dataset.key] === b.dataset.v))));

  $("page-link").hidden = !show;
  if (show) {
    $("page-link").href = show.url;
    $("page-link").textContent = `Open the ${show.label} page`;
  }
  $("play-btn").disabled = !show && selected.size === 0;
  $("clear-btn").disabled = selected.size === 0;
  $("mute-btn").setAttribute("aria-pressed", String(state.muted));
  $("mute-btn").textContent = state.muted ? "Sound off" : "Sound on";
  $("kb-octave").textContent = withOctave(state.octave);
}

// On a narrow screen the keyboard scrolls sideways: bring the shown notes into the middle of it
function revealShown() {
  const show = currentShow();
  const box = document.querySelector(".piano-scroll");
  if (!show || box.scrollWidth <= box.clientWidth) return;
  const first = keyEls.get(show.notes[0].abs);
  const last = keyEls.get(show.notes[show.notes.length - 1].abs);
  const middle = (first.offsetLeft + last.offsetLeft + last.offsetWidth) / 2;
  box.scrollTo({ left: middle - box.clientWidth / 2 });
}

/* ---------- Playing ---------- */

function stopPlaying() {
  playTimers.forEach(clearTimeout);
  playTimers = [];
  flashing.clear();
}

// lights a key for a moment, as if it were pressed
function flash(abs, delay, length) {
  playTimers.push(setTimeout(() => { flashing.add(abs); render(); }, delay * 1000));
  playTimers.push(setTimeout(() => { flashing.delete(abs); render(); }, (delay + length) * 1000));
}

// Play: the shown scale or arpeggio one note at a time, the shown chord all at once, or else the selected keys
function playAll() {
  stopPlaying();
  const show = currentShow();
  const notes = show ? show.notes.map((n) => n.abs) : [...selected].sort((a, b) => a - b);
  const together = !show || state.show === "chord";
  notes.forEach((abs, i) => {
    const delay = together ? 0 : i * 0.32;
    sound(abs, { delay, length: together ? 1.2 : 0.32 }); // each note of a scale stops as the next one starts
    flash(abs, delay, together ? 0.6 : 0.28);
  });
}

function toggleKey(abs) {
  if (selected.has(abs)) {
    selected.delete(abs);
  } else {
    selected.add(abs);
    sound(abs);
  }
  render();
}

/* ---------- The address (/keyboard/?show=scale&key=a-minor&form=harmonic&hand=lh) ---------- */

function saveToAddress() {
  const params = new URLSearchParams();
  if (state.show !== "none") {
    params.set("show", state.show);
    params.set("key", state.key);
    if (state.show === "scale" && KEYS.find((k) => k.slug === state.key).minor) params.set("form", state.form);
    if (state.hand !== "rh") params.set("hand", state.hand);
  }
  history.replaceState(null, "", params.toString() ? `?${params}` : location.pathname);
}

function readAddress() {
  const params = new URLSearchParams(location.search);
  const pick = (name, allowed) => (allowed.includes(params.get(name)) ? params.get(name) : state[name]);
  state.show = pick("show", ["none", "scale", "arpeggio", "chord"]);
  state.key = pick("key", KEYS.map((k) => k.slug));
  state.form = pick("form", ["natural", "harmonic", "melodic"]);
  state.hand = pick("hand", ["rh", "lh"]);
}

/* ---------- Page setup ---------- */

const optionsFor = (minor) => KEYS.filter((k) => k.minor === minor).map((k) => `<option value="${k.slug}">${k.name}</option>`).join("");
$("key-select").innerHTML = `<optgroup label="Major keys">${optionsFor(false)}</optgroup><optgroup label="Minor keys">${optionsFor(true)}</optgroup>`;

drawPiano();
readAddress();

// a key sounds as soon as it is pressed (pointerdown); `click` is for the keyboard (Enter or Space on a focused key)
let pointerPressed = false;
$("piano").addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".pkey");
  if (!el || e.button !== 0) return;
  pointerPressed = true;
  toggleKey(Number(el.dataset.abs));
});
$("piano").addEventListener("click", (e) => {
  const el = e.target.closest(".pkey");
  if (!el) return;
  if (pointerPressed) { pointerPressed = false; return; }
  toggleKey(Number(el.dataset.abs));
});
// a press that ends off the key sends no click: forget it once the click would have come
document.addEventListener("pointerup", () => setTimeout(() => { pointerPressed = false; }));

document.querySelector(".kb-options").addEventListener("click", (e) => {
  const b = e.target.closest(".seg button");
  if (!b) return;
  state[b.closest(".seg").dataset.key] = b.dataset.v;
  stopPlaying();
  saveToAddress();
  render();
  revealShown();
});
$("key-select").addEventListener("change", (e) => {
  state.key = e.target.value;
  stopPlaying();
  saveToAddress();
  render();
  revealShown();
});

$("play-btn").addEventListener("click", playAll);
$("clear-btn").addEventListener("click", () => { selected.clear(); render(); });
$("mute-btn").addEventListener("click", () => { state.muted = !state.muted; render(); });

// the computer keys: a note sounds while its key is held down
const releaseAll = () => { held.forEach((h) => h.release()); held.clear(); render(); };
document.addEventListener("keydown", (e) => {
  const typing = e.target instanceof Element && e.target.closest("input, select, textarea");
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing) return;
  const k = e.key.toLowerCase();
  if (k === "z" || k === "x") {
    releaseAll();
    state.octave = OCTAVES[Math.max(0, Math.min(OCTAVES.length - 1, OCTAVES.indexOf(state.octave) + (k === "x" ? 1 : -1)))];
    render();
    return;
  }
  const i = COMPUTER_KEYS.indexOf(k);
  if (i < 0 || held.has(k)) return;
  e.preventDefault();
  const abs = state.octave + i;
  held.set(k, { abs, release: sound(abs, { hold: true }) });
  render();
});
document.addEventListener("keyup", (e) => {
  const h = held.get(e.key.toLowerCase());
  if (!h) return;
  h.release();
  held.delete(e.key.toLowerCase());
  render();
});
window.addEventListener("blur", releaseAll);

render();
revealShown();
