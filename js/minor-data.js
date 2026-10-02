// Minor scale data. Load this after scales-data.js, which supplies spellScale().
// Notes are GENERATED from a formula; fingerings are entered by hand.

// whole = 2, half = 1, a step and a half = 3 (semitones between neighbouring notes)
const MINOR_STEPS = {
    natural: [2, 1, 2, 2, 1, 2, 2],
    harmonic: [2, 1, 2, 2, 1, 3, 1], // 7th note raised
    melodic: [2, 1, 2, 2, 2, 2, 1], // 6th and 7th raised (ascending form)
};

// [name, letter, semitone, right-hand fingering, left-hand fingering, optional alternate name]
// Order follows the circle of fifths. One-octave fingerings, ascending.
// The same fingering is used for the natural, harmonic and melodic forms.
const MINOR_DEFS = [
    ["A", "A", 9, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
    ["E", "E", 4, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
    ["B", "B", 11, [1, 2, 3, 1, 2, 3, 4, 5], [4, 3, 2, 1, 4, 3, 2, 1]],
    ["F♯", "F", 6, [3, 4, 1, 2, 3, 1, 2, 3], [3, 2, 1, 4, 3, 2, 1, 3]],
    ["C♯", "C", 1, [3, 4, 1, 2, 3, 1, 2, 3], [3, 2, 1, 4, 3, 2, 1, 3]],
    ["G♯", "G", 8, [3, 4, 1, 2, 3, 1, 2, 3], [3, 2, 1, 4, 3, 2, 1, 3]],
    ["E♭", "E", 3, [3, 1, 2, 3, 4, 1, 2, 3], [3, 2, 1, 4, 3, 2, 1, 3], ["D♯", "D", 3]],
    ["B♭", "B", 10, [2, 1, 2, 3, 1, 2, 3, 4], [3, 2, 1, 4, 3, 2, 1, 3]],
    ["F", "F", 5, [1, 2, 3, 4, 1, 2, 3, 4], [5, 4, 3, 2, 1, 3, 2, 1]],
    ["C", "C", 0, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
    ["G", "G", 7, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
    ["D", "D", 2, [1, 2, 3, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 3, 2, 1]],
];

// MINOR_SCALES.natural / .harmonic / .melodic, each a list of 12 scales.
// keyNotes = the natural minor spelling, which is exactly what the key signature
// contains, so any note that differs from it needs an accidental on the staff.
const MINOR_SCALES = Object.fromEntries(
    Object.keys(MINOR_STEPS).map((type) => [
        type,
        MINOR_DEFS.map(([name, letter, semi, rh, lh, alt]) => ({
            name, rh, lh,
            ...spellScale(letter, semi, MINOR_STEPS[type]),
            keyName: name.replace("♯", "#").replace("♭", "b") + "m",
            keyNotes: spellScale(letter, semi, MINOR_STEPS.natural).notes,
            alt: alt && { name: alt[0], notes: spellScale(alt[1], alt[2], MINOR_STEPS[type]).notes },
        })),
    ])
);