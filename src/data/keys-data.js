// The keys to build pages for. Add a key by adding an entry here, then run `npm run build` (or keep `npm run dev` running).
//
// Major scale fingering is NOT listed here: it comes from MAJOR_SCALES in scales-data.js (next to this file).
// Minor scale, arpeggio and chord fingerings are listed per key, entered by hand.
//
//   rootIndex   position of the key's root in CHORD_ROOTS (public/js/chords-data.js): 0 = C, 1 = D♭, 2 = D ...
//   scaleIndex  position of the key's major scale in MAJOR_SCALES (scales-data.js): 0 = C, 1 = G ...
//   keySig      key signature as VexFlow names it ("C", "G", "Bb", ...)
//   arpeggio    one octave ascending, lowest note first
//   chord       one fingering per inversion: root position, 1st inversion, 2nd inversion
//   altRoot     optional. true when the key's root is the alternate spelling in CHORD_ROOTS: G♭ major, C♯ minor,
//               G♯ minor, D♯ minor. A major key with altRoot uses the fingering of its scaleIndex scale (G♭ major
//               plays the same keys as F♯ major) with the notes spelled from its own root.
//   twoOctave   optional. Two-octave fingerings are worked out from the one-octave ones (see withTwoOctaves in
//               scripts/build.js). If a key needs different numbers, give them here:
//               twoOctave: { scale: { rh: [...15 numbers], lh: [...] }, arpeggio: { rh: [...7 numbers], lh: [...] } }
//   octaveShift optional. Moves a hand's notes up or down in whole octaves, on the sheet music and the keyboard
//               of the scale and arpeggio pages: octaveShift: { rh: -1, lh: 0 } puts the right hand one
//               octave lower. Use it to keep the notes close to the staff so they are easier to read.
//
//   type        optional. "minor" for a minor key; the default is a major key. A minor key has no scaleIndex. Instead:
//                 scale: { rh: [8 numbers], lh: [8 numbers] }   one-octave fingering of the natural minor scale. The
//                   notes of all three forms (natural, harmonic, melodic) are made from the formula in scales-data.js.
//                 forms: { harmonic: { rh, lh }, melodic: { rh, lh } }   optional, if a form needs other numbers
//                 altRoot: true   for the keys whose root is the alternate spelling in CHORD_ROOTS (C♯ minor, G♯ minor,
//                   D♯ minor)
//                 keySig is the minor key as VexFlow names it ("Am", "F#m", "Ebm" ...)
//
// C major uses the standard fingerings. Before you trust a key with black keys in it, check its numbers against
// a reliable source or a teacher: many of them differ from the C major pattern. A "CHECK" comment marks numbers
// that were entered as a first guess and still need that check. The build stops with a message if a key's
// scaleIndex or rootIndex points at the wrong place in the data files.
module.exports = [
  {
    slug: "c-major",
    name: "C major",
    rootIndex: 0,
    scaleIndex: 0,
    keySig: "C",
    signature: "no sharps or flats",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // G major has one black key (F♯) and uses the same finger numbers as C major
    slug: "g-major",
    name: "G major",
    rootIndex: 7,
    scaleIndex: 1,
    keySig: "G",
    signature: "one sharp (F♯)",
    octaveShift: { rh: -1 }, // right hand starts one octave lower (G3), so it sits closer to the left hand
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    slug: "d-major",
    name: "D major",
    rootIndex: 2,
    scaleIndex: 2,
    keySig: "D",
    signature: "two sharps (F♯, C♯)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    slug: "a-major",
    name: "A major",
    rootIndex: 9,
    scaleIndex: 3,
    keySig: "A",
    signature: "three sharps (F♯, C♯, G♯)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    slug: "e-major",
    name: "E major",
    rootIndex: 4,
    scaleIndex: 4,
    keySig: "E",
    signature: "four sharps (F♯, C♯, G♯, D♯)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: arpeggio (left hand is a first guess)
    slug: "b-major",
    name: "B major",
    rootIndex: 11,
    scaleIndex: 5,
    keySig: "B",
    signature: "five sharps (F♯, C♯, G♯, D♯, A♯)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [4, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: arpeggio and chords (all black keys, so the numbers differ from C major)
    slug: "f-sharp-major",
    name: "F♯ major",
    rootIndex: 6,
    scaleIndex: 6,
    keySig: "F#",
    signature: "six sharps (F♯, C♯, G♯, D♯, A♯, E♯)",
    arpeggio: { rh: [2, 4, 1, 2], lh: [4, 2, 1, 4] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // The same keys as F♯ major, written with flats, so it has F♯ major's fingering.
    // CHECK: arpeggio and chords (as for F♯ major)
    slug: "g-flat-major",
    name: "G♭ major",
    rootIndex: 6,
    altRoot: true,
    scaleIndex: 6,
    keySig: "Gb",
    signature: "six flats (B♭, E♭, A♭, D♭, G♭, C♭)",
    arpeggio: { rh: [2, 4, 1, 2], lh: [4, 2, 1, 4] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: arpeggio and chords (copied from the C major pattern)
    slug: "d-flat-major",
    name: "D♭ major",
    rootIndex: 1,
    scaleIndex: 7,
    keySig: "Db",
    signature: "five flats (B♭, E♭, A♭, D♭, G♭)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: arpeggio and chords (copied from the C major pattern)
    slug: "a-flat-major",
    name: "A♭ major",
    rootIndex: 8,
    scaleIndex: 8,
    keySig: "Ab",
    signature: "four flats (B♭, E♭, A♭, D♭)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: arpeggio and chords (copied from the C major pattern)
    slug: "e-flat-major",
    name: "E♭ major",
    rootIndex: 3,
    scaleIndex: 9,
    keySig: "Eb",
    signature: "three flats (B♭, E♭, A♭)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: arpeggio and chords (copied from the C major pattern)
    slug: "b-flat-major",
    name: "B♭ major",
    rootIndex: 10,
    scaleIndex: 10,
    keySig: "Bb",
    signature: "two flats (B♭, E♭)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    slug: "f-major",
    name: "F major",
    rootIndex: 5,
    scaleIndex: 11,
    keySig: "F",
    signature: "one flat (B♭)",
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    type: "minor",
    slug: "a-minor",
    name: "A minor",
    rootIndex: 9,
    keySig: "Am",
    signature: "no sharps or flats",
    scale: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    type: "minor",
    slug: "e-minor",
    name: "E minor",
    rootIndex: 4,
    keySig: "Em",
    signature: "one sharp (F♯)",
    scale: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: scale (left hand) and arpeggio
    type: "minor",
    slug: "b-minor",
    name: "B minor",
    rootIndex: 11,
    keySig: "Bm",
    signature: "two sharps (F♯, C♯)",
    // CHECK left hand: the old minor scales page had 4 3 2 1 4 3 2 1
    scale: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 3, 2, 1, 4] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: scales (all three forms), arpeggio and chords
    type: "minor",
    slug: "f-sharp-minor",
    name: "F♯ minor",
    rootIndex: 6,
    keySig: "F#m",
    signature: "three sharps (F♯, C♯, G♯)",
    // CHECK left hand: the old minor scales page had 3 2 1 4 3 2 1 3
    scale: { rh: [3, 4, 1, 2, 3, 1, 2, 3], lh: [4, 3, 2, 1, 3, 2, 1, 4] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: scales (all three forms), arpeggio and chords
    type: "minor",
    slug: "c-sharp-minor",
    name: "C♯ minor",
    rootIndex: 1,
    altRoot: true,
    keySig: "C#m",
    signature: "four sharps (F♯, C♯, G♯, D♯)",
    scale: { rh: [3, 4, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: scales (all three forms), arpeggio and chords
    type: "minor",
    slug: "g-sharp-minor",
    name: "G♯ minor",
    rootIndex: 8,
    altRoot: true,
    keySig: "G#m",
    signature: "five sharps (F♯, C♯, G♯, D♯, A♯)",
    scale: { rh: [3, 4, 1, 2, 3, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: scales (all three forms), arpeggio and chords
    type: "minor",
    slug: "e-flat-minor",
    name: "E♭ minor",
    rootIndex: 3,
    keySig: "Ebm",
    signature: "six flats (B♭, E♭, A♭, D♭, G♭, C♭)",
    scale: { rh: [3, 1, 2, 3, 4, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // The same keys as E♭ minor, written with sharps, so it has E♭ minor's fingering.
    // CHECK: scales (all three forms), arpeggio and chords (as for E♭ minor)
    type: "minor",
    slug: "d-sharp-minor",
    name: "D♯ minor",
    rootIndex: 3,
    altRoot: true,
    keySig: "D#m",
    signature: "six sharps (F♯, C♯, G♯, D♯, A♯, E♯)",
    scale: { rh: [3, 1, 2, 3, 4, 1, 2, 3], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    // CHECK: scales (all three forms), arpeggio and chords
    type: "minor",
    slug: "b-flat-minor",
    name: "B♭ minor",
    rootIndex: 10,
    keySig: "Bbm",
    signature: "five flats (B♭, E♭, A♭, D♭, G♭)",
    scale: { rh: [2, 1, 2, 3, 1, 2, 3, 4], lh: [3, 2, 1, 4, 3, 2, 1, 3] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    type: "minor",
    slug: "f-minor",
    name: "F minor",
    rootIndex: 5,
    keySig: "Fm",
    signature: "four flats (B♭, E♭, A♭, D♭)",
    scale: { rh: [1, 2, 3, 4, 1, 2, 3, 4], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    type: "minor",
    slug: "c-minor",
    name: "C minor",
    rootIndex: 0,
    keySig: "Cm",
    signature: "three flats (B♭, E♭, A♭)",
    scale: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    type: "minor",
    slug: "g-minor",
    name: "G minor",
    rootIndex: 7,
    keySig: "Gm",
    signature: "two flats (B♭, E♭)",
    scale: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
  {
    type: "minor",
    slug: "d-minor",
    name: "D minor",
    rootIndex: 2,
    keySig: "Dm",
    signature: "one flat (B♭)",
    scale: { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    arpeggio: { rh: [1, 2, 3, 5], lh: [5, 3, 2, 1] },
    chord: {
      rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
      lh: [[5, 3, 1], [5, 2, 1], [5, 3, 1]],
    },
  },
];
