// A keyboard to look at, drawn with the same keys as the homepage's (piano.css): used by the key pages
// (key-page.js), the chord explorer (chords.js) and, at build time, the intervals page (scripts/build.js). The keys
// run from `from` to `to` (semitones from middle C, 0 = C4, both white keys). The keys in `marks`
// ([{ abs, finger, name }]) are lit, with the finger number on them when `showFingers` is on and the note's name when
// it has one; every other C is labelled with its octave (C4). Each key carries its note (data-abs), so a page can
// light it while it sounds.
function pianoKeysHTML({ from, to, marks, showFingers = true, label }) {
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const isBlack = (abs) => [1, 3, 6, 8, 10].includes(((abs % 12) + 12) % 12);
  const byKey = new Map(marks.map((m) => [m.abs, m]));
  let whites = 0;
  for (let abs = from; abs <= to; abs++) if (!isBlack(abs)) whites++;
  const w = 100 / whites; // width of a white key, in %

  let html = "";
  let seen = 0; // white keys placed so far
  for (let abs = from; abs <= to; abs++) {
    const black = isBlack(abs);
    const m = byKey.get(abs);
    // a black key sits on the line between two white keys
    const style = black ? ` style="left:${(seen * w - w * 0.31).toFixed(3)}%;width:${(w * 0.62).toFixed(3)}%"` : "";
    const finger = m && showFingers && m.finger != null ? m.finger : "";
    const name = m && m.name ? m.name : ((abs % 12) + 12) % 12 === 0 ? `C${4 + Math.floor(abs / 12)}` : "";
    html += `<span class="pkey ${black ? "black" : "white"}${m ? " is-shown" : ""}" data-abs="${abs}"${style}>`
      + `<span class="pkey-finger">${finger}</span><span class="pkey-name">${name}</span></span>`;
    if (!black) seen++;
  }
  return `<div class="piano piano-static" role="img" aria-label="${esc(label)}" style="--whites:${whites}">${html}</div>`;
}
