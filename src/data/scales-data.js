// Major scale data, read by scripts/build.js for the key pages. Notes are GENERATED from a formula; fingerings are
// entered by hand.
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURALS = [0, 2, 4, 5, 7, 9, 11];   // semitone of each natural letter
const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1]; // whole, whole, half, whole, whole, whole, half

// Builds the 8 notes of a scale (major unless other `steps` are given). Each letter is used once, so the
// spelling comes out right (F♯ major has E♯, D♭ major has G♭, and so on).
function spellScale(letter, semi, steps = MAJOR_STEPS) {
  const start = LETTERS.indexOf(letter);
  const notes = [];
  const semis = [];
  let total = 0;
  for (let i = 0; i < 8; i++) {
    if (i > 0) total += steps[i - 1];
    const li = (start + i) % 7;
    let d = ((semi + total - NATURALS[li]) % 12 + 12) % 12;
    if (d > 6) d -= 12;
    notes.push(LETTERS[li] + (d > 0 ? "♯".repeat(d) : "♭".repeat(-d)));
    semis.push(semi + total); // absolute semitone, 0 = middle C
  }
  return { notes, semis };
}

// [name, letter, semitone, right-hand fingering, left-hand fingering, optional alternate name]
// Order follows the circle of fifths. One-octave fingerings, ascending.
const SCALE_DEFS = [
  ["C", "C", 0, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
  ["G", "G", 7, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
  ["D", "D", 2, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
  ["A", "A", 9, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
  ["E", "E", 4, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
  ["B", "B", 11, [1, 2, 3, 1, 2, 3, 4, 5], [4, 3, 2, 1, 4, 3, 2, 1]],
  ["F♯", "F", 6, [2, 3, 4, 1, 2, 3, 1, 2], [4, 3, 2, 1, 3, 2, 1, 4], ["G♭", "G", 6]],
  ["D♭", "D", 1, [2, 3, 1, 2, 3, 4, 1, 2], [3, 2, 1, 4, 3, 2, 1, 3]],
  ["A♭", "A", 8, [3, 4, 1, 2, 3, 1, 2, 3], [3, 2, 1, 4, 3, 2, 1, 3]],
  ["E♭", "E", 3, [3, 1, 2, 3, 4, 1, 2, 3], [3, 2, 1, 4, 3, 2, 1, 3]],
  ["B♭", "B", 10, [4, 1, 2, 3, 1, 2, 3, 4], [3, 2, 1, 4, 3, 2, 1, 3]],
  ["F", "F", 5, [1, 2, 3, 4, 1, 2, 3, 4], [5, 4, 3, 2, 1, 3, 2, 1]],
];

const MAJOR_SCALES = SCALE_DEFS.map(([name, letter, semi, rh, lh, alt]) => ({
  name, rh, lh,
  ...spellScale(letter, semi),
  alt: alt && { name: alt[0], notes: spellScale(alt[1], alt[2]).notes },
}));