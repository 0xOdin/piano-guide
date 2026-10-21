// Diagrams for the theory pages, drawn at build time as inline SVG (no JavaScript in the browser). The colours come
// from the site's CSS: the keyboard uses the .kb styles in chords.css, the circle the .cof styles in theory.css.
// Used by scripts/build.js.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const NATURAL_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // semitone of C D E F G A B

/* ---------- A small keyboard ---------- */

// `whiteKeys` white keys starting on C. `marks` is a Map from semitone (0 = the first C) to { label, root }: those
// keys are filled in with the label written on them, and the root a darker colour.
function keyboard({ whiteKeys, marks, label }) {
  const KW = 26, KH = 104, BW = 16, BH = 64;
  let whites = "";
  let blacks = "";
  let w = 0; // white keys drawn so far
  for (let s = 0; w < whiteKeys; s++) {
    const m = marks.get(s);
    const cls = (m ? " on" : "") + (m && m.root ? " root" : "");
    if (NATURAL_SEMIS.includes(s % 12)) {
      const x = w * KW;
      const text = m ? `<text class="note" x="${x + KW / 2}" y="${KH - 14}">${esc(m.label)}</text>` : "";
      whites += `<g class="white${cls}"><rect x="${x + 0.5}" y="-6" width="${KW - 1}" height="${KH + 5}" rx="3"/>${text}</g>`;
      w++;
    } else if (w < whiteKeys) {
      const x = w * KW - BW / 2; // a black key sits on the line between two white keys
      const text = m ? `<text class="note" x="${x + BW / 2}" y="${BH - 10}">${esc(m.label)}</text>` : "";
      blacks += `<g class="black${cls}"><rect x="${x}" y="-6" width="${BW}" height="${BH + 6}" rx="2"/>${text}</g>`;
    }
  }
  return `<svg class="kb" viewBox="0 0 ${whiteKeys * KW} ${KH}" role="img" aria-label="${esc(label)}">${whites}${blacks}</svg>`;
}

/* ---------- A mini keyboard for the list cards ---------- */

// Nine white keys from the white key at or below `from` (a semitone, 0 = C), so a scale fits from its first note to
// the same note an octave up. The keys in `lit` (semitones on the same count, 12 being the next C) are filled in and
// the key it starts on, `from`, has a dot. The felt strip runs along the top as on the homepage's keyboard. The card's
// title says what it shows, so the drawing is hidden from screen readers. Coloured by .mini-kb in lists.css.
function miniKeyboard({ from, lit }) {
  const KW = 11, KH = 44, BW = 6.6, BH = 27, FELT = 2.5, WHITES = 9;
  let s = from;
  while (!NATURAL_SEMIS.includes(((s % 12) + 12) % 12)) s--;
  const on = new Set(lit);
  let whites = "";
  let blacks = "";
  let dot = "";
  for (let w = 0; w < WHITES; s++) {
    const cls = on.has(s) ? " on" : "";
    if (NATURAL_SEMIS.includes(((s % 12) + 12) % 12)) {
      const x = w * KW;
      whites += `<rect class="w${cls}" x="${x}" y="-3" width="${KW}" height="${KH + 3}" rx="1.8"/>`;
      if (s === from) dot = `<circle class="dot" cx="${x + KW / 2}" cy="${KH - 6}" r="2.1"/>`;
      w++;
    } else {
      const x = w * KW - BW / 2; // a black key sits on the line between two white keys
      blacks += `<rect class="b${cls}" x="${x}" y="-3" width="${BW}" height="${BH + 3}" rx="1.4"/>`;
      if (s === from) dot = `<circle class="dot dot-light" cx="${x + BW / 2}" cy="${BH - 5}" r="1.7"/>`;
    }
  }
  return `<svg class="mini-kb" viewBox="0 0 ${WHITES * KW} ${KH + FELT}" aria-hidden="true" focusable="false">`
    + `<g transform="translate(0 ${FELT})">${whites}${blacks}${dot}</g><rect class="felt" width="${WHITES * KW}" height="${FELT}"/></svg>`;
}

/* ---------- The circle of fifths ---------- */

// `slots`: 12 positions, clockwise from the top (C major), each { majors: [{ name, label, url, sig }], minors: [...] }.
// The majors fill the outer ring and the relative minors the inner ring; every key is a link that highlights on hover.
// The bottom position holds two spellings of the same keys (F♯ / G♭ major, D♯ / E♭ minor): its wedge is split across
// the middle by a faint line, the sharp key in the part nearer the centre and the flat key further out. From the
// outside it looks like every other position: one wedge with the usual outline.
function circleOfFifths(slots) {
  const C = 240; // centre
  const R = { outer: 222, mid: 152, inner: 92 };
  const at = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [Number((C + r * Math.cos(a)).toFixed(2)), Number((C + r * Math.sin(a)).toFixed(2))];
  };
  const point = (r, deg) => at(r, deg).join(" ");
  const wedge = (r1, r2, from, to) =>
    `M${point(r2, from)} A${r2} ${r2} 0 0 1 ${point(r2, to)} L${point(r1, to)} A${r1} ${r1} 0 0 0 ${point(r1, from)}Z`;

  // one key: its part of the ring (between two radii, 30° wide) with the name, and in the outer ring the key
  // signature under it. `small`: half a wedge, so the text is smaller and closer together.
  const cell = (k, r1, r2, deg, ring, small) => {
    const [x, y] = at((r1 + r2) / 2, deg);
    const nameY = k.sig ? y - (small ? 1 : 0) : y + (small ? 4 : 5);
    const name = `<text class="cof-name${small ? " is-small" : ""}" x="${x}" y="${nameY}">${esc(k.label)}</text>`;
    const sig = k.sig ? `<text class="cof-sig" x="${x}" y="${y + (small ? 12 : 18)}">${esc(k.sig)}</text>` : "";
    return `<a class="cof-cell cof-${ring}${small ? " is-half" : ""}" href="${k.url}" aria-label="${esc(k.name)}"><path d="${wedge(r1, r2, deg - 15, deg + 15)}"/>${name}${sig}</a>`;
  };
  // a position: one key in the whole wedge, or two keys splitting it across the middle (the sharp key first, nearer
  // the centre)
  const ring = (keys, r1, r2, deg, name) => {
    if (keys.length === 1) return cell(keys[0], r1, r2, deg, name, false);
    const mid = (r1 + r2) / 2;
    const outline = `<path class="cof-outline" d="${wedge(r1, r2, deg - 15, deg + 15)}"/>`;
    const divider = `<path class="cof-divider" d="M${point(mid, deg - 15)} A${mid} ${mid} 0 0 1 ${point(mid, deg + 15)}"/>`;
    return cell(keys[0], r1, mid, deg, name, true) + cell(keys[1], mid, r2, deg, name, true) + divider + outline;
  };

  const cells = slots.map((slot, i) => {
    const deg = -90 + i * 30;
    return ring(slot.majors, R.mid, R.outer, deg, "major") + ring(slot.minors, R.inner, R.mid, deg, "minor");
  }).join("");

  return `<svg class="cof" viewBox="0 0 480 480" role="group" aria-label="The circle of fifths: major keys on the outside, their relative minor keys inside">
  ${cells}
  <circle class="cof-centre" cx="${C}" cy="${C}" r="${R.inner}"/>
  <text class="cof-hint" x="${C}" y="${C - 8}">♯ clockwise</text>
  <text class="cof-hint" x="${C}" y="${C + 14}">♭ anticlockwise</text>
</svg>`;
}

module.exports = { keyboard, miniKeyboard, circleOfFifths };
