// Checks the built site's music (npm run check, after npm run build): every key page's data against its own
// fingering table, note chips and key signature, against the Keyboard page's data and every row of the scale and
// arpeggio fingering charts (one octave and two), and the fingering against a few rules (thumb under going up in the
// right hand, cross over in the left, no finger twice in a row, no thumb on a black key in the middle of a scale or
// arpeggio, except where every note is black). It exits with an error, and lists what is wrong, if anything disagrees.
const fs = require("fs");
const path = require("path");
const dist = process.argv[2] || path.join(__dirname, "..", "dist");
// built for GitHub Pages, every link starts with the site's folder (BASE_PATH): read the pages without it
const base = (process.env.BASE_PATH || "").replace(/\/+$/, "").replace(/^(?=[^/])/, "/");
const read = (p) => {
  const html = fs.readFileSync(path.join(dist, p), "utf8");
  return base ? html.split(`"${base}/`).join('"/') : html;
};
const problems = [];
const warn = (where, what) => problems.push(`${where}: ${what}`);

const json = (html, id) => JSON.parse(html.match(new RegExp(`id="${id}">([\\s\\S]*?)</script>`))[1]);
const pc = (abs) => ((abs % 12) + 12) % 12;
const BLACK = [1, 3, 6, 8, 10];
const LETTERS = "CDEFGAB";

// key signatures as VexFlow names them -> the accidentals they hold
const SHARPS = ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯", "B♯"], FLATS = ["B♭", "E♭", "A♭", "D♭", "G♭", "C♭", "F♭"];
const MAJ = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const MIN = { A: 0, E: 1, B: 2, "F#": 3, "C#": 4, "G#": 5, "D#": 6, "A#": 7, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };
const sigAccidentals = (sig) => {
  const minor = sig.endsWith("m");
  const n = (minor ? MIN : MAJ)[minor ? sig.slice(0, -1) : sig];
  if (n === undefined) return null;
  return n >= 0 ? SHARPS.slice(0, n) : FLATS.slice(0, -n);
};

const keyboard = json(read("keyboard/index.html"), "keyboard-data");
const kbBySlug = Object.fromEntries(keyboard.map((k) => [k.slug, k]));
const charts = { scales: read("scales/fingering-chart/index.html"), arpeggios: read("arpeggios/fingering-chart/index.html") };

const keyDirs = fs.readdirSync(path.join(dist, "keys")).filter((d) => d !== "chromatic");
let pagesChecked = 0;
for (const slug of keyDirs) {
  const sub = fs.readdirSync(path.join(dist, "keys", slug)).filter((d) => fs.statSync(path.join(dist, "keys", slug, d)).isDirectory());
  for (const page of ["", ...sub]) {
    const file = path.join("keys", slug, page, "index.html");
    const html = read(file);
    const data = json(html, "page-data");
    const where = `/keys/${slug}/${page}`;
    pagesChecked++;
    // the fingering table(s) written in the page
    const tables = [...html.matchAll(/<table class="finger-grid"[\s\S]*?<\/table>/g)].map((m) => {
      const t = m[0];
      const notes = [...t.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((x) => x[1]);
      const rows = [...t.matchAll(/<tr>\s*<th scope="row"><abbr[^>]*>(RH|LH)<\/abbr><\/th>([\s\S]*?)<\/tr>/g)].map((r) => ({ hand: r[1], fingers: [...r[2].matchAll(/<td[^>]*>(\d)<\/td>/g)].map((x) => Number(x[1])) }));
      return { notes, rows };
    });
    const chips = [...html.matchAll(/class="note-chip[^"]*" data-abs="(-?\d+)" aria-label="([^"]+)"/g)].map((m) => ({ abs: Number(m[1]), name: m[2] }));
    const sig = (html.match(/data-sig="([^"]+)"/) || [])[1];

    if (data.mode === "melodic") {
      for (const n of [1, 2]) {
        const o = data.octaves[n];
        if (o.rh.length !== o.notes.length || o.lh.length !== o.notes.length) warn(where, `${n} octave(s): ${o.notes.length} notes but ${o.rh.length}/${o.lh.length} fingers`);
        const t = tables[n - 1];
        if (!t) { warn(where, `no fingering table for ${n} octave(s)`); continue; }
        if (t.notes.join() !== o.notes.map((x) => x.name).join()) warn(where, `table notes ${t.notes.join(" ")} vs data ${o.notes.map((x) => x.name).join(" ")}`);
        const rh = t.rows.find((r) => r.hand === "RH"), lh = t.rows.find((r) => r.hand === "LH");
        if (rh.fingers.join() !== o.rh.join() || lh.fingers.join() !== o.lh.join()) warn(where, `table fingers differ from data (${n} oct)`);
        // notes go up, and each name sounds the key it names
        o.notes.forEach((x, i) => {
          if (i && x.abs <= o.notes[i - 1].abs) warn(where, `notes not ascending at ${x.name}`);
          const natural = [0, 2, 4, 5, 7, 9, 11][LETTERS.indexOf(x.name[0])];
          const acc = (x.name.match(/♯/g) || []).length - (x.name.match(/♭/g) || []).length + (x.name.includes("𝄪") ? 2 : 0) - (x.name.includes("𝄫") ? 2 : 0);
          if (pc(natural + acc) !== pc(x.abs)) warn(where, `${x.name} doesn't sound at ${x.abs}`);
        });
      }
      const one = data.octaves[1];
      const isScale = one.notes.length === 8;
      // a scale uses each letter once
      if (isScale && new Set(one.notes.slice(0, 7).map((x) => x.name[0])).size !== 7) warn(where, `letters repeat: ${one.notes.map((x) => x.name).join(" ")}`);
      // chips: the first 7 notes of a scale, or the 3 of an arpeggio
      const want = one.notes.slice(0, isScale ? 7 : 3);
      if (chips.map((c) => c.name).join() !== want.map((x) => x.name).join() || chips.map((c) => c.abs).join() !== want.map((x) => x.abs).join()) warn(where, `chips ${chips.map((c) => c.name).join(" ")} vs ${want.map((x) => x.name).join(" ")}`);
      // key signature matches the natural minor / major notes (scale pages that aren't harmonic/melodic)
      if (sig && isScale && !/harmonic|melodic/.test(page)) {
        const acc = sigAccidentals(sig);
        const inScale = one.notes.slice(0, 7).map((x) => x.name).filter((nm) => /[♯♭]/.test(nm)).sort();
        if (!acc) warn(where, `unknown key signature ${sig}`);
        else if (acc.slice().sort().join() !== inScale.join()) warn(where, `key signature ${sig} (${acc.join(" ")}) vs scale accidentals ${inScale.join(" ")}`);
      }
      // fingering sanity, one octave going up
      for (const hand of ["rh", "lh"]) {
        const f = one[hand];
        f.forEach((x, i) => {
          if (i && x === f[i - 1]) warn(where, `${hand}: same finger twice in a row (${x}) at ${one.notes[i].name}`);
          if (hand === "rh" && i && x < f[i - 1] && x !== 1) warn(where, `rh: ${f[i - 1]}→${x} going up isn't a thumb-under`);
          if (hand === "lh" && i && x > f[i - 1] && f[i - 1] !== 1) warn(where, `lh: ${f[i - 1]}→${x} going up isn't a cross-over from the thumb`);
          const allBlack = one.notes.every((nt) => BLACK.includes(pc(nt.abs)));
          if (x === 1 && !allBlack && BLACK.includes(pc(one.notes[i].abs)) && i !== 0 && i !== f.length - 1) warn(where, `${hand}: thumb on a black key (${one.notes[i].name})`);
        });
      }
      // the same as the Keyboard page shows
      const kb = kbBySlug[slug];
      if (kb) {
        const which = isScale ? (kb.minor ? kb.scale[page.replace("/", "") || "natural"] : kb.scale.major) : kb.arpeggio;
        if (which) {
          if (which.notes.map((x) => x.name).join() !== one.notes.map((x) => x.name).join()) warn(where, `Keyboard page notes differ: ${which.notes.map((x) => x.name).join(" ")}`);
          if (which.rh.join() !== one.rh.join() || which.lh.join() !== one.lh.join()) warn(where, "Keyboard page fingers differ");
        } else warn(where, "not on the Keyboard page");
      }
    } else {
      data.inversions.forEach((inv, i) => {
        for (const hand of ["rh", "lh"]) {
          const h = inv[hand];
          if (h.notes.length !== h.fingers.length) warn(where, `${inv.label} ${hand}: ${h.notes.length} notes, ${h.fingers.length} fingers`);
          h.notes.forEach((x, j) => { if (j && x.abs <= h.notes[j - 1].abs) warn(where, `${inv.label} ${hand} not ascending`); });
          if (hand === "rh" && (h.fingers[0] !== 1 || h.fingers[h.fingers.length - 1] !== 5)) warn(where, `${inv.label} rh fingers ${h.fingers.join(" ")}`);
          if (hand === "lh" && (h.fingers[0] !== 5 || h.fingers[h.fingers.length - 1] !== 1)) warn(where, `${inv.label} lh fingers ${h.fingers.join(" ")}`);
        }
        const t = tables[i];
        if (!t || t.notes.join() !== inv.rh.notes.map((x) => x.name).join()) warn(where, `${inv.label} table notes differ`);
        // the bass of each inversion: root, 3rd, 5th
        const root = data.inversions[0].rh.notes[0].name;
        if (i === 0 && inv.rh.notes[0].name !== root) warn(where, "root position doesn't start on the root");
      });
      const want = data.inversions[0].rh.notes;
      if (chips.map((c) => c.name).join() !== want.map((x) => x.name).join()) warn(where, `chips ${chips.map((c) => c.name).join(" ")} vs ${want.map((x) => x.name).join(" ")}`);
    }
  }
}
// every key's row is in the fingering charts, with the same fingers
for (const k of keyboard) {
  const major = k.scale.major || k.scale.natural;
  const row = charts.scales.match(new RegExp(`href="/keys/${k.slug}/"[\\s\\S]*?</tr>`));
  if (!row) { warn("scale chart", `no row for ${k.slug}`); continue; }
  const fingers = [...row[0].matchAll(/<span class="oct-1">([\s\S]*?)<\/span>\s*<span class="oct-2">/g)].map((m) => [...m[1].matchAll(/class="f[^"]*">(\d)</g)].map((x) => Number(x[1])).join(""));
  if (fingers.length >= 2 && (fingers[0] !== major.rh.join("") || fingers[1] !== major.lh.join(""))) warn("scale chart", `${k.slug}: ${fingers.join(" / ")} vs ${major.rh.join("")} / ${major.lh.join("")}`);
  if (!new RegExp(`href="/keys/${k.slug}/arpeggio/"`).test(charts.arpeggios)) warn("arpeggio chart", `no row for ${k.slug}`);
}
// every row of both charts against the page it links to, for one octave and for two
const digits = (s) => [...s.matchAll(/class="f[^"]*">(\d)</g)].map((x) => x[1]).join("");
for (const [name, chart] of Object.entries(charts)) {
  for (const row of chart.matchAll(/<th scope="row"><a href="(\/keys\/[^"]+)">[\s\S]*?<\/tr>/g)) {
    const data = json(read(path.join(row[1].slice(1), "index.html")), "page-data");
    for (const hand of row[0].matchAll(/<abbr title="(Right|Left) hand">[\s\S]*?(?=<abbr|<\/td>)/g)) {
      const h = hand[1] === "Right" ? "rh" : "lh";
      const [one, two] = hand[0].split('<span class="oct-2">');
      [[1, one], [2, two]].forEach(([n, part]) => {
        const want = data.octaves[n][h].join("");
        if (digits(part || "") !== want) warn(`${name} chart`, `${row[1]} ${h} ${n} octave${n > 1 ? "s" : ""}: ${digits(part || "")} vs ${want}`);
      });
    }
  }
}
console.log(`${pagesChecked} key pages checked: ${problems.length ? `${problems.length} problem(s)` : "all agree"}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
}
