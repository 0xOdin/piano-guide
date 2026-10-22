// The practice page (/practice/): a random scale, chord or chord of a key to play or write out, or something to name.
// Two ways to answer: "Play" (the keys on the page, by click, tap or the computer keys, a MIDI keyboard, and, when
// "Your own piano" is on, a real piano heard through the microphone, listen.js), or "Type or self-check" (write the
// notes, or play it anywhere and show the answer). The microphone only starts when the person allows it on the page,
// every time. The questions, and reading and checking the answers, are in
// practice-music.js.
// The keyboard data (every key's scales) is written into the page by scripts/build.js.

const $ = (id) => document.getElementById(id);
const KEYS = JSON.parse($("keys-data").textContent);

/* ---------- Options ---------- */

// The options are kept in this browser between visits, and the drill is also in the address (?drill=chords)
const DEFAULTS = {
  drill: "scales", // scales | chords | key (chords in a key) | name
  answer: "play", // play (the page's keys or MIDI, and the microphone when listen is on) | type (write it, or show the answer)
  listen: "off", // on: the microphone listens to your own piano too (it still asks first)
  keys: "all", // all, "0" to "5" (at most that many sharps or flats), or one key's slug
  scaleForms: ["major", "natural", "harmonic", "melodic"],
  chordTypes: ["major", "minor"],
  roots: "all", // all | white
  inversions: "off",
  keyMode: "one", // one chord | all seven in order
  keySize: "3", // triads | 7th chords
  keyTypes: ["major", "minor"],
  minorForm: "natural", // the scale a minor key's chords are made from
  nameWhat: ["chords", "intervals", "scales"],
  nameHow: "both", // see | hear | both
  hand: "mixed", // mixed (each question picks one) | rh | lh: the hand to play with
  autoNext: "on",
  sound: "on",
  midiSound: "off", // play the MIDI keyboard's notes here too (for a keyboard without a sound of its own)
};
const DRILLS = ["scales", "chords", "key", "name"];
const STORE = "pianoguide-practice";
const VERSION = 3; // what the saved options were made by: 2 has melodic minor among the default scales, 3 two ways to answer

const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of Object.keys(DEFAULTS)) {
    if (k in saved && Array.isArray(saved[k]) === Array.isArray(DEFAULTS[k]) && typeof saved[k] === typeof DEFAULTS[k]) settings[k] = saved[k];
  }
  // saved before melodic minor joined the default scales: the old default becomes the new one, once. Scales of your
  // own choosing stay as they are.
  if ((saved.version || 1) < 2 && settings.scaleForms.join() === "major,natural,harmonic") settings.scaleForms = [...DEFAULTS.scaleForms];
  // there used to be four ways to answer: "My piano" is now Play with your own piano on, "Self-check" is Type
  if (settings.answer === "listen") settings.listen = "on";
  if (settings.answer === "self") settings.answer = "type";
  if (!["play", "type"].includes(settings.answer)) settings.answer = "play";
} catch (e) {
  // no storage here (a private window): the defaults
}
const askedDrill = new URLSearchParams(location.search).get("drill");
if (DRILLS.includes(askedDrill)) settings.drill = askedDrill;
if (!DRILLS.includes(settings.drill)) settings.drill = DEFAULTS.drill;

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...settings, version: VERSION }));
  } catch (e) {
    // not kept, which is fine
  }
  history.replaceState(null, "", `?drill=${settings.drill}`);
}

/* ---------- The keyboard ---------- */

const LOW = 0; // C4 (0 = middle C)
const HIGH = 24; // C6
const isBlack = (abs) => ![0, 2, 4, 5, 7, 9, 11].includes(pcOf(abs));
const withOctave = (abs) => `${noteName(abs)}${4 + Math.floor(abs / 12)}`;
const onKeyboard = (abs) => abs >= LOW && abs <= HIGH;

// the computer keys, from the C they start on: the home row plays the white keys, the row above the black keys
const COMPUTER_KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"];
let octave = 0; // the computer keys start on C4 (0) or C5 (12)

const keyEls = new Map(); // abs -> button
const picked = new Set(); // keys clicked for a chord
const marks = new Map(); // abs -> { mark: "right" | "wrong" | "shown", name }
const down = new Set(); // keys sounding right now

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
      + `<span class="pkey-finger"></span><span class="pkey-name"></span></button>`;
    if (!black) whites++;
  }
  $("piano").innerHTML = html;
  $("piano").querySelectorAll(".pkey").forEach((el) => keyEls.set(Number(el.dataset.abs), el));
}

function renderPiano() {
  keyEls.forEach((el, abs) => {
    const m = marks.get(abs);
    const mark = m ? m.mark : null;
    el.classList.toggle("is-selected", picked.has(abs) && !mark);
    el.classList.toggle("is-right", mark === "right");
    el.classList.toggle("is-wrong", mark === "wrong");
    el.classList.toggle("is-shown", mark === "shown");
    el.classList.toggle("is-down", down.has(abs));
    el.setAttribute("aria-pressed", String(picked.has(abs)));
    el.querySelector(".pkey-finger").textContent = mark === "wrong" ? "✕" : m && m.finger ? m.finger : "";
    el.querySelector(".pkey-name").textContent = m && m.name ? m.name : pcOf(abs) === 0 ? withOctave(abs) : "";
  });
  $("kb-octave").textContent = withOctave(octave);
}

// lights the notes of an answer, named as the answer spells them, with the finger for each one when given
function showNotes(notes, mark, withNames = true, fingers = null) {
  notes.forEach((n, i) => {
    if (onKeyboard(n.abs)) marks.set(n.abs, { mark, name: withNames ? n.name : "", finger: fingers ? fingers[i] : "" });
  });
}

// On a narrow screen the keyboard scrolls sideways: bring these notes into the middle of it
function bringIntoView(notes) {
  const box = document.querySelector(".piano-scroll");
  const shown = notes.filter((n) => onKeyboard(n.abs));
  if (!shown.length || box.scrollWidth <= box.clientWidth) return;
  const first = keyEls.get(Math.min(...shown.map((n) => n.abs)));
  const last = keyEls.get(Math.max(...shown.map((n) => n.abs)));
  box.scrollTo({ left: (first.offsetLeft + last.offsetLeft + last.offsetWidth) / 2 - box.clientWidth / 2 });
}

const HAND_NAMES = { rh: "Right hand", lh: "Left hand" };
// the hand to play with (an answer that is typed may be played on a piano and checked too)
const handShown = () => !!q.hand;
// the fingers for the question's notes with that hand: a scale or one chord (not all the chords of a key)
const answerFingers = () => (!handShown() ? null
  : q.kind === "sequence" ? q.fingers[q.hand]
  : q.kind === "chord" ? chordFingers(q.chord, q.hand) : null);

// the notes a question is about
const questionNotes = () => (q.kind === "sequence" || q.kind === "choice" ? q.notes
  : q.kind === "chord" ? q.chord.notes : q.chords.flatMap((c) => c.notes));

/* ---------- Sound ---------- */

// The piano's sound (piano-sound.js). `hold`: keep sounding until the returned function is called, for a MIDI key
// held down. While the microphone listens, it is told to ignore the page's own sound.
function sound(abs, { delay = 0, length = 0.8, hold = false } = {}) {
  if (settings.sound === "off") return () => {};
  if (listener) listener.quiet(delay + (hold ? 6 : length) + 0.6);
  return playPiano(abs, { delay, length, hold });
}

let playTimers = [];
let playingNotes = []; // lets go of the notes played by the page, so a sound started again begins on its own
function stopPlaying() {
  playTimers.forEach(clearTimeout);
  playTimers = [];
  playingNotes.forEach((letGo) => letGo());
  playingNotes = [];
  down.clear();
}

// lights a key for a moment, as if it were pressed
function flash(abs, delay, length) {
  playTimers.push(setTimeout(() => { down.add(abs); renderPiano(); }, delay * 1000));
  playTimers.push(setTimeout(() => { down.delete(abs); renderPiano(); }, (delay + length) * 1000));
}

// plays notes one after another, or together; returns how long it takes
function playNotes(notes, { together = false, start = 0 } = {}) {
  notes.forEach((n, i) => {
    const delay = start + (together ? 0 : i * 0.32);
    playingNotes.push(sound(n.abs, { delay, length: together ? 1.2 : 0.32 })); // each note of a scale stops as the next one starts
    flash(n.abs, delay, together ? 0.6 : 0.28);
  });
  return together ? 1 : notes.length * 0.32;
}

// The question's sound ("Name it"): an interval goes up, then sounds together
function playQuestion() {
  stopPlaying();
  const t = playNotes(q.notes, { together: q.together });
  if (q.notes.length === 2) playNotes(q.notes, { together: true, start: t + 0.25 });
}

function playAnswer() {
  stopPlaying();
  if (q.kind === "choice") return playQuestion();
  if (q.kind === "sequence") return playNotes(q.notes);
  if (q.kind === "chord") return playNotes(q.chord.notes, { together: true });
  q.chords.forEach((c, i) => playNotes(c.notes, { together: true, start: i * 1.3 }));
}

/* ---------- The question ---------- */

let q = null;
let status = "asking"; // asking | right | shown (the answer was shown, or a wrong choice made)
let step = 0; // notes of a scale, or chords of a key, played right so far
let mistakes = 0;
let typed = null; // the last typed answer, marked: [{ name, mark }]
let chosen = -1; // the answer picked ("Name it")
let lastId = null;
let lastHands = []; // the hands of the last two questions, newest first
let nextTimer = null;
let refocus = false; // put the cursor back in the answer box for the next question

// answered on a piano and checked by the page: its keys, the computer keys or MIDI, and your own piano when listening
const playing = () => settings.drill !== "name" && settings.answer === "play";
const wantsMic = () => playing() && settings.listen === "on";
// where answers come from: the page's keys, the computer keys and MIDI, and the microphone when it is wanted
const answersFrom = (from) => playing() && (from !== "mic" || wantsMic());
const chordKind = () => q && (q.kind === "chord" || q.kind === "chord-seq");
const answeringChord = (from) => answersFrom(from) && status === "asking" && chordKind();
const currentChord = () => (q.kind === "chord-seq" ? q.chords[step] : q.chord);

function newQuestion() {
  for (let i = 0; i < 12; i++) {
    q = makeQuestion(KEYS, settings);
    if (q.id !== lastId) break;
  }
  lastId = q.id;
  // the hand to play it with: the one chosen, or either at random, but never three times running ("Name it" has none)
  q.hand = settings.drill === "name" ? null : settings.hand !== "mixed" ? settings.hand
    : lastHands[0] && lastHands[0] === lastHands[1] ? (lastHands[0] === "rh" ? "lh" : "rh") : pick(["rh", "lh"]);
  if (q.hand) lastHands = [q.hand, lastHands[0]];
  startAnswer();
  if (q.kind === "choice" && settings.nameHow !== "see") playTimers.push(setTimeout(playQuestion, 250));
}

// back to the start of the question: nothing played, typed or chosen yet
function startAnswer() {
  if (listener && !wantsMic()) stopListening(); // left "Listening": the microphone goes off
  clearTimeout(nextTimer);
  stopPlaying();
  status = "asking";
  step = 0;
  mistakes = 0;
  typed = null;
  chosen = -1;
  picked.clear();
  marks.clear();
  midiChord = new Set();
  micHits = 0;
  $("type-input").value = "";
  if (q.kind === "choice" && settings.nameHow !== "hear") showNotes(q.notes, "shown", false);
  say("");
  render();
  // not for a sound to name: where it sits on the keys would give it away
  if (q.kind !== "choice" || settings.nameHow !== "hear") bringIntoView(questionNotes());
  if (refocus && settings.answer === "type") $("type-input").focus({ preventScroll: true });
  refocus = false;
}

function say(text, tone = "") {
  $("feedback").textContent = text;
  $("feedback").className = `pr-feedback${tone ? ` is-${tone}` : ""}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The answer is right, or was shown: light it on the keys and say so
function finish(right) {
  clearTimeout(nextTimer);
  status = right ? "right" : "shown";
  marks.clear();
  picked.clear();
  const fingers = answerFingers();
  if (q.kind === "sequence") showNotes(q.notes, right ? "right" : "shown", true, fingers);
  if (q.kind === "chord") showNotes(q.chord.notes, right ? "right" : "shown", true, fingers);
  if (q.kind === "choice") showNotes(q.notes, right ? "right" : "shown");
  if (q.kind === "chord-seq") step = q.chords.length;
  const notes = (list) => list.map((n) => n.name).join(" ");
  const answer = (q.kind === "sequence" ? notes(q.notes)
    : q.kind === "chord" ? `${q.chord.symbol}: ${notes(q.chord.notes)}`
    : q.kind === "chord-seq" ? q.chords.map((c) => c.symbol).join(" ")
    : q.reveal) + (fingers ? ` · ${HAND_NAMES[q.hand]}: ${fingers.join(" ")}` : "");
  if (right) {
    const slips = mistakes ? ` (${plural(mistakes, "wrong try")} on the way)` : "";
    say(`Right! ${answer}${slips}`, "good");
    if (!playing()) playAnswer();
    if (settings.autoNext === "on") nextTimer = setTimeout(newQuestion, q.kind === "chord-seq" ? 2600 : 1800);
  } else {
    say(q.kind === "choice" ? `Not quite. ${answer}` : `The answer: ${answer}`, "info");
    playAnswer();
  }
  render();
  bringIntoView(questionNotes());
}

/* ---------- Answering by playing ---------- */

// A note from the keys on the page, the computer keys, a MIDI keyboard or the microphone
function playedNote(abs, from) {
  if (!q || !answersFrom(from) || status !== "asking") return;
  if (q.kind === "sequence") {
    stepNote(abs, from);
  } else if (from === "screen" || from === "computer") {
    if (picked.has(abs)) picked.delete(abs);
    else picked.add(abs);
    marks.clear(); // the marks of the last check go once the keys change
    render();
  }
}

// a scale, note by note
function stepNote(abs, from) {
  const want = q.notes[step];
  if (pcOf(abs) === pcOf(want.abs)) {
    step++;
    if (onKeyboard(abs)) marks.set(abs, { mark: "right", name: want.name });
    if (step === q.notes.length) return finish(true);
    say("");
  } else {
    // the microphone may hear an earlier note still ringing; going up, a scale never comes back to a note it has played
    if (from === "mic" && q.notes.slice(0, step).some((n) => pcOf(n.abs) === pcOf(abs))) return;
    if (from !== "mic") mistakes++; // what the microphone hears is said, not held against you: it can mishear
    if (onKeyboard(abs) && !marks.has(abs)) {
      marks.set(abs, { mark: "wrong" });
      playTimers.push(setTimeout(() => { if (marks.get(abs) && marks.get(abs).mark === "wrong") marks.delete(abs); renderPiano(); }, 700));
    }
    const heard = from === "mic" ? "Heard" : "That's";
    say(step === 0 ? `${heard} ${noteName(abs)}. Start on ${want.name}.` : `${heard} ${noteName(abs)}, not the next note.`, "bad");
  }
  render();
}

// a chord: the keys clicked, held on a MIDI keyboard, or heard
function judgeChord(absList, from) {
  const chord = currentChord();
  const result = checkPlayedChord(absList, chord);
  const nameOf = (abs) => (chord.notes.find((n) => pcOf(n.abs) === pcOf(abs)) || {}).name;
  marks.clear();
  if (result.right) {
    if (q.kind === "chord") return finish(true);
    step++;
    picked.clear();
    if (step === q.chords.length) return finish(true);
    for (const abs of absList) if (onKeyboard(abs)) marks.set(abs, { mark: "right", name: nameOf(abs) });
    say(`${chord.numeral} is ${chord.symbol}. Now chord ${step + 1}.`, "good");
  } else {
    mistakes++;
    for (const abs of absList) if (onKeyboard(abs)) marks.set(abs, nameOf(abs) ? { mark: "right", name: nameOf(abs) } : { mark: "wrong" });
    say(result.notesRight
      ? `Right notes. Now put ${chord.notes[0].name} at the bottom, for the ${INVERSION_NAMES[chord.inv].toLowerCase()}.`
      : `Not quite: that's ${namePlayed(absList)}.`, "bad");
  }
  render();
}

function checkPicked() {
  if (!answeringChord("screen")) return;
  if (picked.size < 2) {
    say("Pick the keys of the chord, then check.", "info");
    return;
  }
  judgeChord([...picked], "screen");
}

/* ---------- Answering by typing ---------- */

// A scale, or the chords of a key, can be written a part at a time. The right ones at the start are kept: they fill
// their boxes for good and leave the text box, so the rest can be written after them (Enter after the first chord
// saves it). Whatever isn't right stays in the box to fix.
function checkTypedPart(text) {
  const scale = q.kind === "sequence";
  const r = checkTypedInOrder(text, (scale ? q.notes : q.chords).slice(step), scale ? "notes" : "chords");
  if (r.error) {
    say(r.error, "info");
    return;
  }
  let kept = 0;
  while (kept < r.marks.length && r.marks[kept].mark === "right") kept++;
  step += kept;
  const need = scale ? 7 : q.chords.length; // a scale's seven notes (the octave at the top may follow, or not)
  if (step >= need) {
    refocus = true;
    finish(true);
    return;
  }
  const left = words(text).slice(kept);
  $("type-input").value = left.join(" ");
  typed = left.length ? r.marks.slice(kept) : null;
  const what = scale ? "note" : "chord";
  if (!left.length) {
    say(`Right so far: ${plural(need - step, what)} to go.`, "good");
  } else {
    mistakes++;
    const first = typed[0];
    say(first.mark === "spelling"
      ? `${first.name} is the right key, spelled another way.${scale ? " A scale uses each letter once." : ""}`
      : `${first.name} isn't the next ${what}.`, "bad");
  }
  render();
}

function checkTyped() {
  if (status !== "asking") return;
  const text = $("type-input").value;
  if (q.kind === "sequence" || q.kind === "chord-seq") {
    checkTypedPart(text);
    return;
  }
  let r;
  if (settings.drill === "key" && words(text).length === 1) {
    // a chord of a key can be answered with its name
    const c = readChord(words(text)[0]);
    if (!c) {
      r = { error: `“${words(text)[0]}” isn't a chord name. Write its notes (D F A) or its name (Dm).` };
    } else {
      const t = checkTypedChord(c, q.chord);
      r = { marks: [{ name: c.symbol, mark: t.right ? "right" : t.spelling ? "spelling" : "wrong" }], missing: 0, right: t.right };
    }
  } else {
    r = checkTypedNotes(text, q.chord.notes, { bassFirst: q.chord.inv > 0 });
  }
  if (r.error) {
    say(r.error, "info");
    return;
  }
  typed = r.marks;
  if (r.right) {
    refocus = true;
    return finish(true);
  }
  mistakes++;
  const count = (mark) => r.marks.filter((m) => m.mark === mark).length;
  const parts = [];
  if (count("wrong")) parts.push(`${count("wrong")} wrong`);
  if (count("spelling")) parts.push(`${count("spelling")} spelled another way`);
  if (r.missing) parts.push(`${r.missing} missing`);
  if (!parts.length && r.bassWrong) say(`Right notes. Now start with the lowest note of the ${INVERSION_NAMES[q.chord.inv].toLowerCase()}.`, "bad");
  else say(`Not yet: ${parts.join(", ")}.${count("spelling") && q.kind === "sequence" ? " A scale uses each letter once." : ""}`, "bad");
  render();
}

/* ---------- Drawing the page ---------- */

const ASK = {
  sequence: { play: "Play the scale going up, one octave", type: "Write the notes going up, one octave" },
  chord: { play: "Play the chord", type: "Write its notes" },
  keyChord: { play: "Play the chord", type: "Write its notes, or the chord" },
  "chord-seq": { play: "Play the chords in order", type: "Write the chords in order" },
};
const PLACEHOLDER = {
  sequence: "Notes like C, F# or Bb",
  chord: "Notes like C, F# or Bb",
  keyChord: "Notes (D F A) or a chord (Dm)",
  "chord-seq": "Chords like Dm, F#dim or Bbmaj7",
};

function render() {
  const asking = status === "asking";
  const onPage = settings.answer === "play" && settings.drill !== "name"; // answered on the page's keys or MIDI
  const kind = q.kind === "chord" && settings.drill === "key" ? "keyChord" : q.kind;

  // the drill tabs and the options
  $("drills").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === settings.drill)));
  document.querySelectorAll("[data-setting]").forEach((el) => {
    const v = settings[el.dataset.setting];
    if (el.tagName === "SELECT") el.value = v;
    else el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Array.isArray(v) ? v.includes(b.dataset.v) : v === b.dataset.v)));
  });
  document.querySelectorAll("[data-for]").forEach((el) => { el.hidden = !el.dataset.for.split(" ").includes(settings.drill); });
  const oneKeyChosen = oneKey(settings.keys);
  if (settings.drill === "key") {
    $("key-types").hidden = oneKeyChosen;
    const chosenKey = KEYS.find((k) => k.slug === settings.keys);
    $("minor-form").hidden = oneKeyChosen ? !(chosenKey && chosenKey.minor) : !settings.keyTypes.includes("minor");
  }
  $("options-summary").textContent = summary();

  // the question
  $("ask").textContent = q.kind === "choice"
    ? { see: "Look at the keys", hear: "Listen", both: "Look and listen" }[settings.nameHow]
    : ASK[kind][settings.answer];
  $("title").textContent = q.title;
  $("hand").hidden = !handShown();
  if (handShown()) {
    $("hand").className = `pr-hand is-${q.hand}`;
    $("hand-name").textContent = HAND_NAMES[q.hand];
  }
  $("sub").textContent = q.sub || "";
  $("sub").hidden = !q.sub;

  // the answer so far: the notes of a scale, the chords of a key, the notes of a chord once it is done, or the
  // typed answer, marked
  const slots = [];
  if (typed && asking) {
    // the notes or chords already kept, what is being typed after them (marked once checked), then the boxes to fill
    const seq = q.kind === "chord-seq";
    if (q.kind === "sequence") q.notes.slice(0, step).forEach((n) => slots.push({ text: n.name, cls: "right" }));
    if (seq) q.chords.slice(0, step).forEach((c) => slots.push({ text: c.symbol, label: c.numeral, cls: "right" }));
    typed.forEach((t, j) => slots.push({ text: t.name, label: seq ? String(step + j + 1) : "", cls: t.mark || "typed" }));
    const total = q.kind === "sequence" ? q.notes.length : seq ? q.chords.length : 0;
    for (let i = slots.length; i < total; i++) slots.push({ text: "", label: seq ? String(i + 1) : "", cls: "" });
  } else if (q.kind === "sequence") {
    q.notes.forEach((n, i) => slots.push(i < step || !asking ? { text: n.name, cls: status === "shown" ? "shown" : "right" } : { text: "", cls: "" }));
  } else if (q.kind === "chord-seq") {
    q.chords.forEach((c, i) => slots.push(i < step || !asking
      ? { text: c.symbol, label: c.numeral, cls: status === "shown" ? "shown" : "right" }
      : { text: "", label: String(i + 1), cls: "" }));
  } else if (q.kind === "chord" && !asking) {
    q.chord.notes.forEach((n) => slots.push({ text: n.name, cls: status === "shown" ? "shown" : "right" }));
  }
  $("slots").hidden = !slots.length;
  $("slots").innerHTML = "";
  for (const s of slots) {
    const li = document.createElement("li");
    li.className = `pr-slot${s.cls ? ` is-${s.cls}` : ""}${s.label ? " has-label" : ""}`;
    if (s.label) {
      const label = document.createElement("span");
      label.className = "pr-slot-label";
      label.textContent = s.label;
      li.append(label);
    }
    li.append(document.createTextNode(s.text));
    $("slots").append(li);
  }

  // "Name it": the answers to choose from
  $("choices").hidden = q.kind !== "choice";
  $("choices").innerHTML = "";
  if (q.kind === "choice") {
    q.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pr-choice";
      if (!asking && i === q.answer) b.classList.add("is-right");
      if (!asking && i === chosen && i !== q.answer) b.classList.add("is-wrong");
      b.disabled = !asking;
      b.dataset.i = i;
      const label = document.createElement("strong");
      label.textContent = o.label;
      const detail = document.createElement("span");
      detail.textContent = o.detail || "";
      const num = document.createElement("kbd");
      num.textContent = i + 1;
      num.setAttribute("aria-hidden", "true");
      b.append(num, label, detail);
      $("choices").append(b);
    });
  }

  // typing
  const typing = settings.answer === "type" && q.kind !== "choice";
  $("type-form").hidden = !typing;
  $("type-input").placeholder = PLACEHOLDER[kind] || "";
  $("type-input").disabled = !asking;

  // the buttons: one main button for the next step (Check, Show answer or Next question), and small links
  const action = mainAction();
  $("main-btn").hidden = !action;
  $("main-btn").textContent = action ? action.label : "";
  $("main-btn").disabled = !!action && action.label === "Check" && picked.size < 2;
  $("hear-btn").hidden = q.kind !== "choice" && asking;
  $("hear-btn").textContent = q.kind !== "choice" || !asking ? "▶ Hear the answer" : settings.nameHow === "see" ? "▶ Hear it" : "▶ Hear it again";
  $("reveal-btn").hidden = !asking || q.kind === "choice";
  $("clear-btn").hidden = !(asking && onPage && chordKind() && picked.size);
  $("skip-btn").hidden = !asking;
  $("answer-hint").textContent = ANSWER_HINTS[settings.answer === "play" && settings.listen === "on" ? "listen" : settings.answer];
  $("listen-option").hidden = settings.answer !== "play";

  // MIDI and the computer keys for playing, the microphone for listening
  $("midi-row").hidden = !onPage;
  $("kb-help").hidden = !onPage;
  $("listen-panel").hidden = !wantsMic();
  $("mic-ask").hidden = !!listener;
  $("mic-on").hidden = !listener;

  renderPiano();
}

// The main button: Check (chords on the screen keys), Next question (once answered), or nothing while the page waits
// for notes. Show answer is always a link beside it.
function mainAction() {
  if (status !== "asking") return { label: "Next question", run: newQuestion };
  if (playing() && chordKind()) return { label: "Check", run: checkPicked };
  return null;
}

const ANSWER_HINTS = {
  play: "Tap the keys below, or use your computer keys or a MIDI keyboard. To play your own piano, turn on listening.",
  listen: "Play your own piano and the page listens, or tap the keys below, use your computer keys or a MIDI keyboard.",
  type: "Write the notes, like C E G or F# A C#. Or play it on any piano and press Show answer to check yourself.",
};

// one line under "Settings" that says what is chosen
function summary() {
  const list = (arr, names) => arr.map((v) => names[v] || v).join(", ");
  const keyText = settings.keys === "all" ? "all keys"
    : /^\d$/.test(settings.keys) ? `up to ${settings.keys === "0" ? "no" : settings.keys} sharps or flats`
    : (KEYS.find((k) => k.slug === settings.keys) || { name: "all keys" }).name;
  const typeNames = Object.fromEntries(CHORD_TYPES.map((t) => [t.name, t.tab]));
  const handText = { mixed: "either hand", rh: "right hand", lh: "left hand" }[settings.hand];
  if (settings.drill === "scales") return `${list(settings.scaleForms, FORM_NAMES)} · ${keyText} · ${handText}`;
  if (settings.drill === "chords") return `${list(settings.chordTypes, typeNames)} · ${settings.roots === "white" ? "white-key roots" : "any root"}${settings.inversions === "on" ? " · inversions" : ""} · ${handText}`;
  if (settings.drill === "key") return `${settings.keyMode === "all" ? "all seven" : "one chord"} · ${settings.keySize === "4" ? "7th chords" : "triads"} · ${keyText} · ${handText}`;
  return list(settings.nameWhat, {}) + (settings.nameWhat.includes("chords") ? ` · ${list(settings.chordTypes, typeNames)}` : "");
}

/* ---------- MIDI ---------- */

const midiHeld = new Map(); // abs -> stops its sound
let midiChord = new Set(); // the most keys held together since all were last up
let midiMatched = false; // the chord was right before the keys came up

function onMidi(note, on) {
  const abs = note - 60;
  if (on) {
    if (midiHeld.has(abs)) return;
    midiHeld.set(abs, settings.midiSound === "on" ? sound(abs, { hold: true }) : () => {});
    down.add(abs);
    if (answeringChord("midi")) {
      const held = [...midiHeld.keys()];
      if (held.length >= midiChord.size) midiChord = new Set(held);
      if (!midiMatched && checkPlayedChord(held, currentChord()).right) {
        midiMatched = true;
        judgeChord(held, "midi");
      }
    } else {
      playedNote(abs, "midi");
    }
  } else {
    if (!midiHeld.has(abs)) return;
    midiHeld.get(abs)();
    midiHeld.delete(abs);
    down.delete(abs);
    if (midiHeld.size === 0) {
      // all the keys are up: a chord that wasn't right is judged now, so its notes can be named
      if (answeringChord("midi") && !midiMatched && midiChord.size >= 2) judgeChord([...midiChord], "midi");
      midiChord = new Set();
      midiMatched = false;
    }
  }
  renderPiano();
}

async function startMidi() {
  if (!("requestMIDIAccess" in navigator)) {
    $("midi-status").textContent = "This browser can't use MIDI. Chrome and Edge can.";
    return;
  }
  $("midi-status").textContent = "Connecting…";
  try {
    await connectMidi(onMidi, (names) => {
      $("midi-status").textContent = names.length ? `Connected: ${names.join(", ")}` : "No MIDI keyboard found. Plug one in and it will show up here.";
      $("midi-btn").hidden = true;
      $("midi-sound").hidden = false;
      renderMidiSound();
    });
  } catch (e) {
    $("midi-status").textContent = "MIDI was blocked. Allow it in the browser's settings for this site.";
  }
}

function renderMidiSound() {
  $("midi-sound").textContent = settings.midiSound === "on" ? "Sound here: on" : "Sound here: off";
  $("midi-sound").setAttribute("aria-pressed", String(settings.midiSound === "on"));
}

/* ---------- The microphone ---------- */

let listener = null;
let micHits = 0; // readings in a row that heard the right chord
let lastHeardSaid = 0;
let lastPlayed = 0; // when the microphone last heard a key struck (a steady hum or tone doesn't count)
let idleTimer = null;
const MIC_IDLE = 5 * 60 * 1000; // the microphone goes off after this long without hearing anything played

// a key struck on the piano: the next note of a scale moves it on; a different note is only mentioned if it was
// clear, as a faint one may be an overtone of a note still ringing
function onMicStrike(strike) {
  lastPlayed = performance.now();
  const abs = strike.midi - 60;
  if (onKeyboard(abs)) {
    down.add(abs);
    playTimers.push(setTimeout(() => { down.delete(abs); renderPiano(); }, 250));
    renderPiano();
  }
  if (!q || q.kind !== "sequence" || status !== "asking") return;
  if (pcOf(abs) !== pcOf(q.notes[step].abs) && strike.strength < 0.6) return;
  playedNote(abs, "mic");
}

function onMicChord(notes) {
  if (!answeringChord("mic")) return;
  const chord = currentChord();
  if (notes.length && heardChord(notes, chord)) {
    // the same right chord in three readings in a row, about a fifth of a second
    if (++micHits >= 3) {
      micHits = 0;
      const inChord = pcsOf(chord.notes);
      judgeChord(notes.filter((n) => inChord.has(pcOf(n.midi))).map((n) => n.midi - 60), "mic");
    }
    return;
  }
  micHits = 0;
  if (notes.length && performance.now() - lastHeardSaid > 500) {
    lastHeardSaid = performance.now();
    say(`Hearing ${namePlayed(notes.map((n) => n.midi - 60))}`, "info");
  }
}

// Only ever started by the "Allow the microphone" button, after the page has said what it is for. It is never left
// on: it goes off with Stop, when "My piano" is left, when the page is hidden (another tab or app, the screen
// locked) or closed, and after five minutes without hearing anything played. Nothing is remembered: each time, the
// page asks again with its button before it listens.
async function startListening() {
  $("mic-error").textContent = "";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $("mic-error").textContent = window.isSecureContext
      ? "This browser can't use a microphone here."
      : "The microphone only works when the page is opened over https.";
    return;
  }
  const l = new Listener({
    onStrike: onMicStrike,
    onFrame: onMicChord,
    onLevel: (v) => { $("mic-level").style.width = `${Math.round(v * 100)}%`; },
  });
  $("mic-allow").disabled = true;
  try {
    await l.start();
  } catch (e) {
    l.stop();
    $("mic-error").textContent = e && e.name === "NotAllowedError"
      ? "The microphone is blocked for this site. Allow it in the browser's site settings (the icon at the left of the address bar), then try again."
      : e && e.name === "NotFoundError" ? "No microphone was found. Plug one in, or answer another way."
      : "The microphone couldn't start. Is another app using it?";
    return;
  } finally {
    $("mic-allow").disabled = false;
  }
  // the person may have left "Listening", or the page, while the browser was asking
  if (!wantsMic() || document.hidden) {
    l.stop();
    return;
  }
  listener = l;
  lastPlayed = performance.now();
  idleTimer = setInterval(() => {
    if (performance.now() - lastPlayed > MIC_IDLE) stopListening("The microphone went off after five minutes without hearing you play. Allow it again to carry on.");
  }, 15000);
  say("");
  render();
}

// `why` (optional): said under the Allow button when the microphone went off by itself
function stopListening(why) {
  if (listener) listener.stop();
  listener = null;
  clearInterval(idleTimer);
  idleTimer = null;
  micHits = 0;
  $("mic-level").style.width = "0";
  $("mic-error").textContent = typeof why === "string" ? why : "";
  render();
}

// another tab or app, the screen locked, or the page closed: the microphone goes off, and is asked for again
document.addEventListener("visibilitychange", () => {
  if (document.hidden && listener) stopListening("The microphone went off when you left the page. Allow it again to carry on.");
});
window.addEventListener("pagehide", () => {
  if (listener) stopListening();
});

/* ---------- Page setup ---------- */

$("type-chips").innerHTML = CHORD_TYPES.map((t) => `<button type="button" data-v="${t.name}">${t.tab}</button>`).join("");
{
  const counts = ["0", "1", "2", "3", "4", "5"].map((n) => `<option value="${n}">${n === "0" ? "No sharps or flats" : `Up to ${n} sharp${n === "1" ? "" : "s"} or flat${n === "1" ? "" : "s"}`}</option>`).join("");
  const one = (minor) => KEYS.filter((k) => k.minor === minor).map((k) => `<option value="${k.slug}">${k.name}</option>`).join("");
  $("keys-select").innerHTML = `<option value="all">All keys</option>${counts}<optgroup label="One major key">${one(false)}</optgroup><optgroup label="One minor key">${one(true)}</optgroup>`;
}
drawPiano();

// the drill tabs
$("drills").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.dataset.v === settings.drill) return;
  settings.drill = b.dataset.v;
  save();
  newQuestion();
});

// the options: one choice (seg) or several (chips, at least one kept)
const KEEP_QUESTION = ["answer", "listen", "autoNext", "sound", "nameHow"];
document.querySelector(".practice").addEventListener("click", (e) => {
  const b = e.target.closest("[data-setting] button");
  if (!b) return;
  const group = b.closest("[data-setting]");
  const key = group.dataset.setting;
  if (group.classList.contains("chips")) {
    const set = new Set(settings[key]);
    if (set.has(b.dataset.v)) set.delete(b.dataset.v);
    else set.add(b.dataset.v);
    if (!set.size) return;
    settings[key] = [...group.querySelectorAll("button")].map((x) => x.dataset.v).filter((v) => set.has(v));
  } else {
    if (settings[key] === b.dataset.v) return;
    settings[key] = b.dataset.v;
  }
  save();
  if (KEEP_QUESTION.includes(key)) {
    if (key === "answer" || key === "listen" || key === "nameHow") startAnswer();
    else render();
    if (key === "nameHow" && settings.nameHow !== "see") playQuestion();
  } else {
    newQuestion();
  }
});
$("keys-select").addEventListener("change", (e) => {
  settings.keys = e.target.value;
  save();
  newQuestion();
});

// a key sounds as soon as it is pressed (pointerdown); `click` is for the keyboard (Enter or Space on a focused key)
function pressKey(abs, from) {
  sound(abs);
  playedNote(abs, from);
  if (q.kind === "sequence" || !answeringChord(from)) { // not picked for a chord: it lights up for a moment
    down.add(abs);
    playTimers.push(setTimeout(() => { down.delete(abs); renderPiano(); }, 180));
    renderPiano();
  }
}
let pointerPressed = false;
$("piano").addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".pkey");
  if (!el || e.button !== 0) return;
  pointerPressed = true;
  pressKey(Number(el.dataset.abs), "screen");
});
$("piano").addEventListener("click", (e) => {
  const el = e.target.closest(".pkey");
  if (!el) return;
  if (pointerPressed) { pointerPressed = false; return; }
  pressKey(Number(el.dataset.abs), "screen");
});
// a press that ends off the key sends no click: forget it once the click would have come
document.addEventListener("pointerup", () => setTimeout(() => { pointerPressed = false; }));

$("choices").addEventListener("click", (e) => {
  const b = e.target.closest(".pr-choice");
  if (b && status === "asking") choose(Number(b.dataset.i));
});
function choose(i) {
  chosen = i;
  finish(i === q.answer);
}

$("type-form").addEventListener("submit", (e) => {
  e.preventDefault();
  checkTyped();
});
// as it is typed, the boxes show each note or chord written so far; a change clears the last check's marks and message
const tidyName = (w) => w.replace(/^([a-g])/, (c) => c.toUpperCase()).replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭");
$("type-input").addEventListener("input", () => {
  if (status !== "asking") return;
  const written = words($("type-input").value);
  typed = written.length ? written.map((w) => ({ name: tidyName(w), mark: "" })) : null;
  say("");
  render();
});

$("main-btn").addEventListener("click", () => {
  const action = mainAction();
  if (action) action.run();
});
$("clear-btn").addEventListener("click", () => {
  picked.clear();
  marks.clear();
  say("");
  render();
});
$("hear-btn").addEventListener("click", () => (status === "asking" ? playQuestion() : playAnswer()));
$("reveal-btn").addEventListener("click", () => finish(false));
$("skip-btn").addEventListener("click", newQuestion);
$("midi-btn").addEventListener("click", startMidi);
$("midi-sound").addEventListener("click", () => {
  settings.midiSound = settings.midiSound === "on" ? "off" : "on";
  save();
  renderMidiSound();
});
$("mic-allow").addEventListener("click", startListening);
$("mic-stop").addEventListener("click", () => stopListening());

// the computer keys, Enter, and 1 to 4 for "Name it"
document.addEventListener("keydown", (e) => {
  const inField = e.target instanceof Element && e.target.closest("input, select, textarea");
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || inField) return;
  const k = e.key.toLowerCase();
  if (k === "enter") {
    if (e.target instanceof Element && e.target.closest("button, a, summary")) return; // the focused control acts
    e.preventDefault();
    if (status !== "asking") newQuestion();
    else if (answeringChord("screen") && picked.size) checkPicked();
    return;
  }
  if (q.kind === "choice" && status === "asking" && /^[1-4]$/.test(k)) {
    choose(Number(k) - 1);
    return;
  }
  if (k === "z" || k === "x") {
    octave = k === "x" ? 12 : 0;
    renderPiano();
    return;
  }
  const i = COMPUTER_KEYS.indexOf(k);
  if (i < 0) return;
  e.preventDefault();
  pressKey(octave + i, "computer");
});

save();
newQuestion();
