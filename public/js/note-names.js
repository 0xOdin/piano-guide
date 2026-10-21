// Names the keys someone plays, for the keyboard page's readout and the homepage's keyboard: one note, the same note
// in octaves, an interval, or a chord with its inversion. Keys are semitones from middle C (0 = C4).
// describeKeys([0, 4, 7]) -> { title: "C major chord", detail: "C E G · root position" }
// Uses CHORD_ROOTS, CHORD_TYPES, INVERSION_NAMES, spellTone and spellChord from chords-data.js.

const describeKeys = (() => {
  const pc = (abs) => ((abs % 12) + 12) % 12;
  const noteName = (abs) => CHORD_ROOTS[pc(abs)].name; // the black keys are D♭ E♭ F♯ A♭ B♭
  const withOctave = (abs) => `${noteName(abs)}${4 + Math.floor(abs / 12)}`;

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

  return function describe(keys) {
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
})();
