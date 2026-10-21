// The music behind the practice page (/practice/): making the questions, reading typed answers, the chords of a key
// and checking what was played. No page code here: practice.js asks for a question, shows it and checks the answers
// with these functions. Uses LETTER_NAMES, NATURAL_SEMIS, accidentalText, CHORD_ROOTS, CHORD_TYPES, INVERSION_NAMES,
// FINGERING, spellTone, spellChord and voiceChord from chords-data.js.
//
// Notes are { name, abs }: `abs` is the semitone, 0 = middle C, as everywhere on the site. Only the note's place in
// the octave counts when an answer is played (any C is a C), but a typed answer must spell every note as the answer
// does: in B♭ major the 4th note is E♭, and D♯ is the same key but not the right answer.

const pcOf = (abs) => ((abs % 12) + 12) % 12;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Two 7th chords that only come up in a harmonic minor key (its i and III). The chord explorer leaves them out.
const EXTRA_TYPES = [
  { group: "seventh", tab: "Min-maj7", name: "minor-major 7th", symbol: "m(maj7)", tones: [[1, 0, "1"], [3, 3, "♭3"], [5, 7, "5"], [7, 11, "7"]] },
  { group: "seventh", tab: "Aug-maj7", name: "augmented major 7th", symbol: "maj7♯5", tones: [[1, 0, "1"], [3, 4, "3"], [5, 8, "♯5"], [7, 11, "7"]] },
];
const ALL_TYPES = [...CHORD_TYPES, ...EXTRA_TYPES];
const typeNamed = (name) => ALL_TYPES.find((t) => t.name === name);

/* ---------- Reading typed answers ---------- */

const ACCIDENTALS = { "#": 1, "♯": 1, "x": 2, "𝄪": 2, "b": -1, "♭": -1, "𝄫": -2 };

// "Eb", "e♭", "F#", "Fx", "Bbb" -> { letter: "E", d: -1, name: "E♭", pc: 3 }. Null if the text is not a note.
function readNote(text) {
  const m = text.match(/^([A-Ga-g])([#♯x𝄪b♭𝄫]*)$/u);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const d = [...m[2]].reduce((sum, c) => sum + ACCIDENTALS[c], 0);
  if (Math.abs(d) > 2) return null;
  return { letter, d, name: letter + accidentalText(d), pc: pcOf(NATURAL_SEMIS[LETTER_NAMES.indexOf(letter)] + d) };
}

// The words of an answer: "C, E♭ - G" -> ["C", "E♭", "G"]
const words = (text) => text.trim().split(/[\s,;–—-]+/).filter(Boolean);

// The ways a chord's type can be written after its root, once readChord has tidied them up (lower case, ♭ as b,
// ♯ as #, no spaces or brackets).
const SUFFIXES = {
  "": "major", maj: "major", major: "major",
  m: "minor", mi: "minor", min: "minor", minor: "minor",
  dim: "diminished", o: "diminished", diminished: "diminished",
  aug: "augmented", "+": "augmented", augmented: "augmented",
  sus2: "suspended 2nd", sus4: "suspended 4th", sus: "suspended 4th",
  maj7: "major 7th", ma7: "major 7th", major7: "major 7th",
  7: "dominant 7th", dom7: "dominant 7th",
  m7: "minor 7th", mi7: "minor 7th", min7: "minor 7th", minor7: "minor 7th",
  m7b5: "half-diminished 7th", mi7b5: "half-diminished 7th", min7b5: "half-diminished 7th", halfdim: "half-diminished 7th", halfdim7: "half-diminished 7th",
  dim7: "diminished 7th", o7: "diminished 7th",
  mmaj7: "minor-major 7th", mimaj7: "minor-major 7th", minmaj7: "minor-major 7th",
  "maj7#5": "augmented major 7th", "+maj7": "augmented major 7th", augmaj7: "augmented major 7th", "maj7+5": "augmented major 7th",
};

// A chord symbol: "Ebm7", "F#dim", "BbM7", "C°", "Gø7" -> { root, type, symbol }. Null if it is not one.
// A bass note after a slash ("C/E") is ignored: it names the same chord.
function readChord(text) {
  const m = text.replace(/\/.*$/, "").match(/^([A-Ga-g][#♯b♭]?)(.*)$/u);
  const root = m && readNote(m[1]);
  if (!root) return null;
  const suffix = m[2]
    .replace(/[\s()]/g, "")
    .replace(/♭/g, "b").replace(/♯/g, "#")
    .replace(/Δ7?/g, "maj7").replace(/°/g, "dim").replace(/ø7?/g, "m7b5")
    .replace(/M(?!aj|in|i)/g, "maj") // a capital M on its own is major: M7, mM7
    .toLowerCase();
  const type = SUFFIXES[suffix] && typeNamed(SUFFIXES[suffix]);
  return type ? { root, type, symbol: root.name + type.symbol } : null;
}

/* ---------- Naming what was played ---------- */

const noteName = (abs) => CHORD_ROOTS[pcOf(abs)].name; // the black keys are D♭ E♭ F♯ A♭ B♭

// The keys someone played, put into words for "that's ...": "E♭ minor (E♭ G♭ B♭)", spelled as the chord is, or
// just the notes, lowest first.
function namePlayed(absList) {
  const notes = [...new Set(absList)].sort((a, b) => a - b);
  const pcs = [...new Set(notes.map(pcOf))];
  if (pcs.length >= 3) {
    const bass = pcOf(notes[0]);
    for (const r of [bass, ...pcs.filter((p) => p !== bass)]) {
      for (const type of ALL_TYPES) {
        if (type.tones.length !== pcs.length) continue;
        const chord = type.tones.map(([, semis]) => (r + semis) % 12);
        if (!pcs.every((p) => chord.includes(p))) continue;
        const root = spellingsFor(r, type)[0];
        const tones = spellChord(root, type);
        const spelled = (abs) => tones[chord.indexOf(pcOf(abs))].name;
        return `${root.name} ${type.name} (${[...new Set(notes.map(spelled))].join(" ")})`;
      }
    }
  }
  return [...new Set(notes.map(noteName))].join(" ");
}

/* ---------- The keys and their scales ---------- */

// KEYS is the keyboard data from the build (scripts/build.js): every key with its scale, each form of a minor key.
const scaleOf = (key, form) => key.scale[key.minor ? (form === "major" ? "natural" : form) : "major"];
const accidentalCount = (key) => scaleOf(key, "natural").notes.slice(0, 7).filter((n) => /[♯♭]/.test(n.name)).length;
const rootName = (key) => key.name.split(" ")[0];

// The "Keys" option: "all", "0" to "6" (at most that many sharps or flats), or one key's slug
function keysFor(KEYS, filter) {
  const keys = filter === "all" ? KEYS
    : /^\d$/.test(filter) ? KEYS.filter((k) => accidentalCount(k) <= Number(filter))
    : KEYS.filter((k) => k.slug === filter);
  return keys.length ? keys : KEYS;
}
const oneKey = (filter) => filter !== "all" && !/^\d$/.test(filter);

const FORM_NAMES = { major: "major", natural: "natural minor", harmonic: "harmonic minor", melodic: "melodic minor" };
const formsOf = (key) => (key.minor ? ["natural", "harmonic", "melodic"] : ["major"]);
const scaleName = (key, form) => (form === "major" ? key.name : `${rootName(key)} ${FORM_NAMES[form]}`);

/* ---------- The chords of a key ---------- */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
// what follows the numeral; a chord with a minor 3rd has a small numeral (ii, vii°)
const NUMERAL_MARKS = {
  major: "", minor: "", diminished: "°", augmented: "+",
  "major 7th": "maj7", "dominant 7th": "7", "minor 7th": "7", "half-diminished 7th": "ø7", "diminished 7th": "°7",
  "minor-major 7th": "(maj7)", "augmented major 7th": "+maj7",
};

// The seven chords of a scale, made by stacking every other note: `size` 3 for triads, 4 for 7th chords.
// `notes` go up from the root. Each chord keeps the scale's spelling, and its lowest note is put in the octave
// above middle C, where the page's keyboard shows it.
function chordsOfScale(notes, size) {
  const seven = notes.slice(0, 7);
  return seven.map((root, i) => {
    let tones = Array.from({ length: size }, (_, j) => {
      const n = seven[(i + 2 * j) % 7];
      return { name: n.name, abs: n.abs + (i + 2 * j >= 7 ? 12 : 0) };
    });
    const shift = Math.floor(tones[0].abs / 12) * 12;
    tones = tones.map((t) => ({ ...t, abs: t.abs - shift }));
    const semis = tones.map((t) => t.abs - tones[0].abs);
    const type = ALL_TYPES.find((t) => t.tones.length === size && t.tones.every(([, s], j) => s === semis[j]));
    const numeral = (semis[1] === 3 ? ROMAN[i].toLowerCase() : ROMAN[i]) + NUMERAL_MARKS[type.name];
    return { numeral, type, root: readNote(root.name), symbol: root.name + type.symbol, notes: tones };
  });
}

/* ---------- Random chords ---------- */

// Every way to spell a root (C♯ or D♭), keeping only the ones that spell the chord without double sharps or flats
// (D♯ minor yes, D♯ major no: it needs F𝄪). A diminished 7th keeps its double-flat 7th, which is how it is written.
function spellingsFor(pc, type) {
  const r = CHORD_ROOTS[pc];
  const all = r.alt ? [r, r.alt] : [r];
  const tidy = all.filter((root) => spellChord(root, type).every((t, i) => Math.abs(t.d) < 2 || (type.name === "diminished 7th" && i === 3)));
  return tidy.length ? tidy : all;
}

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

// A chord from the options: one of the chosen types, on any root (or a white key), in root position or any inversion
function randomChord(s) {
  const types = CHORD_TYPES.filter((t) => s.chordTypes.includes(t.name));
  const type = pick(types.length ? types : CHORD_TYPES.slice(0, 2));
  const root = pick(spellingsFor(pick(s.roots === "white" ? WHITE_KEYS : [...Array(12).keys()]), type));
  return chordOn(root, type, s.inversions === "on" ? Math.floor(Math.random() * type.tones.length) : 0);
}

function chordOn(root, type, inv = 0) {
  const tones = spellChord(root, type);
  return {
    root: { ...root, pc: root.semi }, type, inv,
    symbol: root.name + type.symbol,
    name: `${root.name} ${type.name}`,
    notes: voiceChord(tones, inv, "rh").map((t) => ({ name: t.name, abs: t.abs })), // lowest first
  };
}

/* ---------- Intervals ---------- */

// [name, letters above the lower note], by semitones from 1 to 12
const INTERVALS = [
  null, ["Minor 2nd", 1], ["Major 2nd", 1], ["Minor 3rd", 2], ["Major 3rd", 2], ["Perfect 4th", 3], ["Tritone", 3],
  ["Perfect 5th", 4], ["Minor 6th", 5], ["Major 6th", 5], ["Minor 7th", 6], ["Major 7th", 6], ["Octave", 7],
];

/* ---------- The questions ---------- */

// Every question has `id` (to avoid asking the same thing twice in a row), `title`, `sub` and a `kind`:
//   "sequence"   notes to play one after another: `notes` (a scale, root to root)
//   "chord"      one chord: `chord` { symbol, name, inv, notes }
//   "chord-seq"  chords to play one after another: `chords` (the seven chords of a key)
//   "choice"     name what is shown or played: `notes`, `together` (play them at once), `options` and `answer` (its index)

function scaleQuestion(KEYS, s) {
  let options = keysFor(KEYS, s.keys).flatMap((key) => formsOf(key).filter((f) => s.scaleForms.includes(f)).map((form) => ({ key, form })));
  if (!options.length) options = keysFor(KEYS, s.keys).flatMap((key) => formsOf(key).map((form) => ({ key, form })));
  const { key, form } = pick(options);
  const scale = scaleOf(key, form);
  return {
    kind: "sequence",
    id: `${key.slug}:${form}`,
    title: scaleName(key, form),
    sub: "",
    notes: scale.notes,
    fingers: { rh: scale.rh, lh: scale.lh }, // one finger for each note, going up
    key, form,
  };
}

// The usual fingering for a chord with one hand (chords-data.js), lowest note first, or null for a chord size it
// doesn't cover
const chordFingers = (chord, hand) => (FINGERING[chord.notes.length] && FINGERING[chord.notes.length][hand][chord.inv]) || null;

function chordQuestion(s) {
  const chord = randomChord(s);
  return {
    kind: "chord",
    id: `${chord.symbol}:${chord.inv}`,
    title: chord.symbol,
    sub: chord.name + (chord.inv ? ` · ${INVERSION_NAMES[chord.inv].toLowerCase()}` : ""),
    chord,
  };
}

function keyChordQuestion(KEYS, s) {
  const one = oneKey(s.keys);
  let keys = keysFor(KEYS, s.keys);
  if (!one) keys = keys.filter((k) => s.keyTypes.includes(k.minor ? "minor" : "major"));
  if (!keys.length) keys = keysFor(KEYS, s.keys);
  const key = pick(keys);
  const form = key.minor ? s.minorForm : "major";
  const sevenths = s.keySize === "4";
  const chords = chordsOfScale(scaleOf(key, form).notes, sevenths ? 4 : 3).map((c) => ({ ...c, name: `${c.root.name} ${c.type.name}`, inv: 0 }));
  const kindOf = `${sevenths ? "7th chords" : "Triads"}${key.minor ? `, from the ${form} minor scale` : ""}`;
  if (s.keyMode === "all") {
    return {
      kind: "chord-seq",
      id: `${key.slug}:${form}:all`,
      title: `Every chord in ${key.name}`,
      sub: `${kindOf}, from the root up`,
      chords, key,
    };
  }
  const chord = pick(chords);
  return {
    kind: "chord",
    id: `${key.slug}:${form}:${chord.numeral}`,
    title: `${chord.numeral} in ${key.name}`,
    sub: kindOf,
    chord, key,
  };
}

// Name it: a chord, an interval or a scale, with four answers to choose from
function nameQuestion(KEYS, s) {
  const what = pick(s.nameWhat.length ? s.nameWhat : ["chords"]);
  if (what === "intervals") {
    const lo = Math.floor(Math.random() * 12);
    const semis = 1 + Math.floor(Math.random() * 12);
    const near = shuffle([-2, -1, 1, 2, 3, -3].map((d) => semis + d).filter((n) => n >= 1 && n <= 12)).slice(0, 3);
    const options = shuffle([semis, ...near]);
    const root = CHORD_ROOTS[lo];
    const upper = spellTone(root.letter, root.semi, INTERVALS[semis][1] + 1, semis); // C to E♭, not C to D♯
    return {
      kind: "choice",
      id: `i:${lo}:${semis}`,
      title: "What interval is this?",
      notes: [{ name: root.name, abs: lo }, { name: upper.name, abs: lo + semis }],
      together: false,
      options: options.map((n) => ({ label: INTERVALS[n][0], detail: `${n} semitone${n === 1 ? "" : "s"}` })),
      answer: options.indexOf(semis),
      reveal: `${INTERVALS[semis][0]}: ${root.name} up to ${upper.name}`,
    };
  }
  if (what === "scales") {
    const q = scaleQuestion(KEYS, s);
    const forms = shuffle(["major", "natural", "harmonic", "melodic"]);
    const options = forms.map((form) => ({ label: form === "major" ? `${rootName(q.key)} major` : `${rootName(q.key)} ${FORM_NAMES[form]}` }));
    return {
      kind: "choice",
      id: `s:${q.id}`,
      title: "What scale is this?",
      notes: q.notes,
      together: false,
      options,
      answer: forms.indexOf(q.form),
      reveal: `${q.title}: ${q.notes.map((n) => n.name).join(" ")}`,
    };
  }
  // a chord, with three that look or sound close to it: the same root with another type, or the same type a step
  // away. None of them has the very same keys (C♯dim7 and E dim7 do, so they never both appear).
  const chord = randomChord(s);
  const keysOf = (c) => [...new Set(c.notes.map((n) => pcOf(n.abs)))].sort((a, b) => a - b).join();
  const sameSize = CHORD_TYPES.filter((t) => t !== chord.type && t.tones.length === chord.type.tones.length);
  const otherTypes = [...shuffle(sameSize.filter((t) => s.chordTypes.includes(t.name))), ...shuffle(sameSize)].map((t) => chordOn(chord.root, t));
  const otherRoots = shuffle([-2, -1, 1, 2]).map((d) => chordOn(pick(spellingsFor(pcOf(chord.root.pc + d), chord.type)), chord.type));
  const options = [chord];
  for (const c of [...otherTypes.slice(0, 2), ...otherRoots, ...otherTypes.slice(2)]) {
    if (options.length < 4 && !options.some((o) => o.symbol === c.symbol || keysOf(o) === keysOf(c))) options.push(c);
  }
  const order = shuffle(options);
  return {
    kind: "choice",
    id: `c:${chord.symbol}:${chord.inv}`,
    title: "What chord is this?",
    notes: chord.notes,
    together: true,
    options: order.map((c) => ({ label: c.symbol, detail: c.name })),
    answer: order.indexOf(chord),
    reveal: `${chord.symbol}: ${chord.notes.map((n) => n.name).join(" ")}${chord.inv ? `, ${INVERSION_NAMES[chord.inv].toLowerCase()}` : ""}`,
  };
}

function makeQuestion(KEYS, s) {
  if (s.drill === "chords") return chordQuestion(s);
  if (s.drill === "key") return keyChordQuestion(KEYS, s);
  if (s.drill === "name") return nameQuestion(KEYS, s);
  return scaleQuestion(KEYS, s);
}

/* ---------- Checking answers ---------- */

const pcsOf = (notes) => new Set(notes.map((n) => pcOf(n.abs)));

// Played keys against a chord: the same notes (in any octave, doubled or not), and in an inversion the right note
// at the bottom. -> { right, notesRight, bassRight }
function checkPlayedChord(absList, chord) {
  const want = pcsOf(chord.notes);
  const got = new Set(absList.map(pcOf));
  const notesRight = got.size === want.size && [...got].every((p) => want.has(p));
  const bassRight = !chord.inv || pcOf(Math.min(...absList)) === pcOf(chord.notes[0].abs);
  return { right: notesRight && bassRight, notesRight, bassRight };
}

// What the microphone hears ([{ midi, strength }], from listen.js) against a chord: every note of the chord is there,
// and nothing else is nearly as loud as the quietest of them. Piano strings ring with their overtones, so a faint
// extra note is let through, and three things overtones do are allowed for:
//  - a bass note well below the rest rings with overtones that are other notes: its 5th, 7th, 9th and 10th (two
//    octaves and a 3rd, a minor 7th, a 9th), when faint, are neither notes of the chord nor wrong notes. A strong one
//    is taken as played (a C2's 5th overtone is the E4 of the chord above it)
//  - anything more than two octaves above the lowest note the hands play is taken for an overtone
//  - a low root's third overtone is the chord's 5th (C3's is G4), and taking the overtones out takes that 5th with it:
//    when the root is heard, a plain 5th counts as heard, unless a ♭5 or ♯5 is heard instead (they tell chords apart)
const BASS_OVERTONES = [5, 7, 9, 10];
const HANDS_SPAN = 24; // semitones above the lowest note the hands play
const FAINT = 0.5; // a bass overtone weaker than this, compared with the strongest note, is only an overtone
function heardChord(heard, chord) {
  if (!heard.length) return false;
  const want = pcsOf(chord.notes);
  const bass = heard.reduce((low, n) => (n.midi < low.midi ? n : low));
  const isBass = want.has(pcOf(bass.midi)) && heard.every((n) => n === bass || n.midi >= bass.midi + 12);
  const overtoneOfBass = (n) => isBass && n !== bass && n.strength < FAINT
    && BASS_OVERTONES.some((h) => Math.abs(Math.pow(2, (n.midi - bass.midi) / 12) / h - 1) < 0.03);
  const upper = heard.filter((n) => !(isBass && n === bass) && !overtoneOfBass(n));
  const floor = upper.length ? Math.min(...upper.map((n) => n.midi)) : bass.midi;
  const played = upper.filter((n) => n.midi <= floor + HANDS_SPAN).concat(isBass ? [bass] : []);

  const inChord = played.filter((n) => want.has(pcOf(n.midi)));
  const found = new Set(inChord.map((n) => pcOf(n.midi)));
  const root = chord.root.pc;
  const fifth = chord.type.tones.some(([, semis]) => semis === 7) ? pcOf(root + 7) : null;
  const altered = played.some((n) => [pcOf(root + 6), pcOf(root + 8)].includes(pcOf(n.midi)));
  if (fifth !== null && found.has(root) && !altered) found.add(fifth);
  if (found.size !== want.size) return false;
  const loudest = (p) => Math.max(0, ...inChord.filter((n) => pcOf(n.midi) === p).map((n) => n.strength));
  const quietest = Math.min(...[...want].map(loudest).filter((v) => v > 0));
  return !played.some((n) => !want.has(pcOf(n.midi)) && n.strength > quietest * 0.5);
}

// Typed notes against the answer. Each typed note is "right", "spelling" (the right key, spelled another way) or
// "wrong". `ordered`: they must come in the answer's order (a scale: 7 notes, or 8 with the root again at the top);
// otherwise any order, except that `bassFirst` wants the answer's lowest note first (an inversion).
// -> { error } when a word is not a note, else { marks: [{ name, mark }], missing, bassWrong, right }
function checkTypedNotes(text, answer, { ordered = false, bassFirst = false } = {}) {
  const typed = [];
  for (const w of words(text)) {
    const n = readNote(w);
    if (!n) return { error: `“${w}” isn't a note name. Write notes like C, F♯ or Bb.` };
    typed.push(n);
  }
  if (!typed.length) return { error: "Write the notes first." };
  const markOf = (n, want) => (!want ? "wrong" : n.name === want.name ? "right" : n.pc === pcOf(want.abs) ? "spelling" : "wrong");
  let marks;
  let missing;
  if (ordered) {
    const want = answer.slice(0, typed.length > 7 ? 8 : 7);
    marks = typed.map((n, i) => ({ name: n.name, mark: markOf(n, want[i]) }));
    missing = Math.max(0, 7 - typed.length);
  } else {
    const names = answer.map((n) => n.name);
    marks = typed.map((n) => {
      if (names.includes(n.name)) return { name: n.name, mark: "right" };
      return { name: n.name, mark: answer.some((a) => pcOf(a.abs) === n.pc) ? "spelling" : "wrong" };
    });
    missing = names.filter((name) => !typed.some((n) => n.name === name)).length;
  }
  const bassWrong = bassFirst && typed[0].name !== answer[0].name;
  return { marks, missing, bassWrong, right: missing === 0 && !bassWrong && marks.every((m) => m.mark === "right") };
}

// A typed chord name ("Gm") against the answer: { right, spelling } (spelling: the right chord, its root spelled
// another way: A♯m for B♭m)
function checkTypedChord(c, chord) {
  const sameType = c.type === chord.type;
  return { right: sameType && c.root.name === chord.root.name, spelling: sameType && c.root.pc === chord.root.pc && c.root.name !== chord.root.name };
}

// Typed chord names for every chord of a key, in order -> { error } or { marks: [{ name, mark }], missing, right }
function checkTypedChords(text, chords) {
  const typed = [];
  for (const w of words(text)) {
    const c = readChord(w);
    if (!c) return { error: `“${w}” isn't a chord name. Write chords like C, Dm, F♯dim or B♭maj7.` };
    typed.push(c);
  }
  if (!typed.length) return { error: "Write the chords first." };
  const marks = typed.map((c, i) => {
    const r = chords[i] ? checkTypedChord(c, chords[i]) : {};
    return { name: c.symbol, mark: r.right ? "right" : r.spelling ? "spelling" : "wrong" };
  });
  const missing = Math.max(0, chords.length - typed.length);
  return { marks, missing, right: missing === 0 && marks.every((m) => m.mark === "right") };
}
