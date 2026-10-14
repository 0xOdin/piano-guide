// Chord data. Notes are GENERATED from a formula (like src/data/scales-data.js); fingerings are entered by hand.
const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // semitone of each natural letter

const accidentalText = (d) => (d > 0 ? "♯".repeat(d) : "♭".repeat(-d));

// Spells one chord tone from the root: `degree` picks the letter (3 = two letters up), `interval` is the
// distance in semitones. Using a new letter for each degree gives the right spelling (C♯ major has E♯, not F).
// `abs` is the absolute semitone, 0 = middle C.
function spellTone(rootLetter, rootSemi, degree, interval) {
  const li = (LETTER_NAMES.indexOf(rootLetter) + degree - 1) % 7;
  const abs = rootSemi + interval;
  let d = (((abs - NATURAL_SEMIS[li]) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return { letter: LETTER_NAMES[li], d, name: LETTER_NAMES[li] + accidentalText(d), abs };
}

// [name, letter, semitone, optional alternate spelling]. In pitch order, starting from C.
const CHORD_ROOTS = [
  { name: "C", letter: "C", semi: 0 },
  { name: "D♭", letter: "D", semi: 1, alt: { name: "C♯", letter: "C", semi: 1 } },
  { name: "D", letter: "D", semi: 2 },
  { name: "E♭", letter: "E", semi: 3, alt: { name: "D♯", letter: "D", semi: 3 } },
  { name: "E", letter: "E", semi: 4 },
  { name: "F", letter: "F", semi: 5 },
  { name: "F♯", letter: "F", semi: 6, alt: { name: "G♭", letter: "G", semi: 6 } },
  { name: "G", letter: "G", semi: 7 },
  { name: "A♭", letter: "A", semi: 8, alt: { name: "G♯", letter: "G", semi: 8 } },
  { name: "A", letter: "A", semi: 9 },
  { name: "B♭", letter: "B", semi: 10, alt: { name: "A♯", letter: "A", semi: 10 } },
  { name: "B", letter: "B", semi: 11 },
];

// Each tone is [degree, semitones above the root, label shown in the formula].
const CHORD_TYPES = [
  { group: "triad", tab: "Major", name: "major", symbol: "", tones: [[1, 0, "1"], [3, 4, "3"], [5, 7, "5"]] },
  { group: "triad", tab: "Minor", name: "minor", symbol: "m", tones: [[1, 0, "1"], [3, 3, "♭3"], [5, 7, "5"]] },
  { group: "triad", tab: "Diminished", name: "diminished", symbol: "dim", tones: [[1, 0, "1"], [3, 3, "♭3"], [5, 6, "♭5"]] },
  { group: "triad", tab: "Augmented", name: "augmented", symbol: "aug", tones: [[1, 0, "1"], [3, 4, "3"], [5, 8, "♯5"]] },
  { group: "triad", tab: "Sus2", name: "suspended 2nd", symbol: "sus2", tones: [[1, 0, "1"], [2, 2, "2"], [5, 7, "5"]] },
  { group: "triad", tab: "Sus4", name: "suspended 4th", symbol: "sus4", tones: [[1, 0, "1"], [4, 5, "4"], [5, 7, "5"]] },
  { group: "seventh", tab: "Maj7", name: "major 7th", symbol: "maj7", tones: [[1, 0, "1"], [3, 4, "3"], [5, 7, "5"], [7, 11, "7"]] },
  { group: "seventh", tab: "Dom7", name: "dominant 7th", symbol: "7", tones: [[1, 0, "1"], [3, 4, "3"], [5, 7, "5"], [7, 10, "♭7"]] },
  { group: "seventh", tab: "Min7", name: "minor 7th", symbol: "m7", tones: [[1, 0, "1"], [3, 3, "♭3"], [5, 7, "5"], [7, 10, "♭7"]] },
  { group: "seventh", tab: "Half-dim", name: "half-diminished 7th", symbol: "m7♭5", tones: [[1, 0, "1"], [3, 3, "♭3"], [5, 6, "♭5"], [7, 10, "♭7"]] },
  { group: "seventh", tab: "Dim7", name: "diminished 7th", symbol: "dim7", tones: [[1, 0, "1"], [3, 3, "♭3"], [5, 6, "♭5"], [7, 9, "♭♭7"]] },
];

const INVERSION_NAMES = ["Root position", "1st inversion", "2nd inversion", "3rd inversion"];

// Standard default fingerings, lowest note first, by number of notes in the chord and inversion.
const FINGERING = {
  3: {
    rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
    lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
  },
  4: {
    rh: [[1, 2, 3, 5], [1, 2, 3, 5], [1, 2, 3, 5], [1, 2, 3, 5]],
    lh: [[5, 3, 2, 1], [5, 3, 2, 1], [5, 3, 2, 1], [5, 3, 2, 1]],
  },
};

// The chord in root position: one spelled tone per formula entry (root first).
function spellChord(root, type) {
  return type.tones.map(([degree, interval, label], i) => ({
    ...spellTone(root.letter, root.semi, degree, interval),
    label,
    root: i === 0,
  }));
}

// Turns a root-position chord into the notes to play: the lowest `inv` notes move up an octave, then the
// whole chord is moved so its lowest note sits within the octave above middle C (right hand). The left hand
// plays one octave lower. Returns the notes sorted from lowest to highest.
function voiceChord(tones, inv, hand) {
  let v = tones.map((t, i) => ({ ...t, abs: t.abs + (i < inv ? 12 : 0) }));
  v.sort((a, b) => a.abs - b.abs);
  const shift = Math.floor(v[0].abs / 12) * 12 + (hand === "lh" ? 12 : 0);
  return v.map((t) => ({ ...t, abs: t.abs - shift }));
}

const chordSymbol = (root, type) => root.name + type.symbol;