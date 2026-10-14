// Builds the whole site into /dist/. Every page shares one layout (src/layout.html: the <head>, header and footer),
// so a change to the header or the menu is made once.
//
//   public/          copied as it is: css, js, assets
//   src/pages/       hand-written pages. Each file is the page's <main> content, with a few settings on top:
//                      ---
//                      title: Piano Chords | PianoGuide
//                      description: ...
//                      nav: chords                  the menu item to mark as the current page (see NAV)
//                      styles: page chords          /css/<name>.css, after main.css
//                      scripts: vexflow chords      /js/<name>.js after main.js ("vexflow" is the CDN copy)
//                      sitemap: no                  leave the page out of sitemap.xml
//                      ---
//                    src/pages/chords/index.html becomes /chords/
//   src/templates/   the key pages, filled in from src/data/keys-data.js:
//
//   major key  /keys/c-major/index.html            scale
//              /keys/c-major/arpeggio/index.html   arpeggio
//              /keys/c-major/chord/index.html      chord
//   minor key  /keys/a-minor/index.html            natural minor scale
//              /keys/a-minor/harmonic/index.html   harmonic minor scale
//              /keys/a-minor/melodic/index.html    melodic minor scale
//              /keys/a-minor/arpeggio/index.html   arpeggio
//              /keys/a-minor/chord/index.html      chord
//
// plus the chromatic scale at /keys/chromatic/, the lists at /keys/, /scales/ and /arpeggios/, /sitemap.xml and /search-index.json
// (read by the search page). Finally every link to a page or file on the site is checked, and the build fails if
// one of them goes nowhere.
//
// Run it with   npm run build   (or npm run dev to build, serve and rebuild on every change).
// It needs only Node.js, no packages. The fingering is written into the HTML itself, so search engines (and
// people with JavaScript off) see it. The sheet music and keyboard are added in the browser by public/js/key-page.js.
//
// Set SITE_URL to your real address before you publish (SITE_URL=https://... npm run build): it goes into the
// canonical links and the sitemap.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE_URL = (process.env.SITE_URL || "https://example.com").replace(/\/$/, "");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");

/* ---------- Pages and the layout ---------- */

// The menu in the header and the footer: [nav id, url, label]
const NAV = [
  ["scales", "/scales/", "Scales"],
  ["arpeggios", "/arpeggios/", "Arpeggios"],
  ["chords", "/chords/", "Chords"],
  ["keys", "/keys/", "Keys"],
];
const SCRIPT_URLS = { vexflow: "https://cdn.jsdelivr.net/npm/vexflow@4.2.5/build/cjs/vexflow.js" };

const layout = fs.readFileSync(path.join(SRC, "layout.html"), "utf8");

// Replaces each {{name}} with vars.name. A {{name}} without a value stops the build, so a typo can't reach the site.
function fill(tpl, vars, file) {
  return tpl.replace(/{{(\w+)}}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`${file}: no value for {{${k}}}`);
    return vars[k];
  });
}

// A page file: the settings between the two --- lines, then the content.
function readPage(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { file: path.relative(ROOT, file), meta, body: m ? text.slice(m[0].length) : text };
}

const words = (s) => (s ? s.split(/\s+/).filter(Boolean) : []);

const pages = []; // { url, out, html, title, description, sitemap }

// Puts a page into the layout. `meta.title` and `meta.description` are plain text; `vars` fill the page's own {{...}}.
function addPage(url, out, { file, meta, body }, vars = {}) {
  if (!meta.title || !meta.description) throw new Error(`${file}: needs a title and a description`);
  const navList = (current) => NAV.map(([id, href, label]) =>
    `                <li><a href="${href}"${id === current ? ' aria-current="page"' : ""}>${label}</a></li>`).join("\n");
  const html = fill(layout, {
    title: esc(meta.title),
    description: esc(meta.description),
    canonical: SITE_URL + url,
    styles: ["main", ...words(meta.styles)].map((n) => `    <link rel="stylesheet" href="/css/${n}.css">`).join("\n"),
    nav: navList(meta.nav),
    footerNav: navList(null),
    content: fill(body.replace(/\s+$/, ""), vars, file),
    scripts: ["main", ...words(meta.scripts)].map((n) => `    <script src="${SCRIPT_URLS[n] || `/js/${n}.js`}"></script>`).join("\n"),
    year: new Date().getFullYear(),
  }, "src/layout.html");
  pages.push({ url, out, html, title: meta.title, description: meta.description, sitemap: meta.sitemap !== "no" });
}

/* ---------- Loading the music data ---------- */

// The music data files are plain browser-style scripts (chords-data.js is also loaded by the chords page). This
// runs one in isolation and hands back the names asked for, so every page uses the very same notes and fingerings.
function loadScript(file, names) {
  const sandbox = {};
  vm.createContext(sandbox);
  const code = fs.readFileSync(file, "utf8");
  vm.runInContext(`${code}\nthis.__out = { ${names.join(", ")} };`, sandbox);
  return sandbox.__out;
}

const { MAJOR_SCALES, spellScale } = loadScript(path.join(SRC, "data", "scales-data.js"), ["MAJOR_SCALES", "spellScale"]);
const { CHORD_ROOTS, CHORD_TYPES, spellChord, voiceChord } =
  loadScript(path.join(PUBLIC, "js", "chords-data.js"), ["CHORD_ROOTS", "CHORD_TYPES", "spellChord", "voiceChord"]);
const KEYS = require(path.join(SRC, "data", "keys-data.js"));

const MAJOR_TRIAD = CHORD_TYPES.find((t) => t.tab === "Major");
const MINOR_TRIAD = CHORD_TYPES.find((t) => t.tab === "Minor");
if (!MAJOR_TRIAD || !MINOR_TRIAD) throw new Error('chords-data.js needs chord types with the tabs "Major" and "Minor"');

// The three forms of a minor scale, as the steps between notes going up (whole, half, ...).
const MINOR_STEPS = {
  natural: [2, 1, 2, 2, 1, 2, 2],
  harmonic: [2, 1, 2, 2, 1, 3, 1], // 7th note raised
  melodic: [2, 1, 2, 2, 2, 2, 1], // 6th and 7th notes raised (going up)
};

// The key's root as chords-data.js describes it: C♯ minor and G♯ minor use the alternate spelling of D♭ and A♭
// (`altRoot: true` in keys-data.js), and the triad is the major or the minor one.
const rootFor = (key) => {
  const r = CHORD_ROOTS[key.rootIndex];
  return key.altRoot ? r && r.alt : r;
};
const triadFor = (key) => (key.type === "minor" ? MINOR_TRIAD : MAJOR_TRIAD);
const INVERSION_NAMES = ["Root position", "1st inversion", "2nd inversion"];

/* ---------- Helpers ---------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = (arr) => arr.join(" ");
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const noteSlug = (note) => note.replace("♯", "-sharp").replace("♭", "-flat").toLowerCase(); // "C♯" -> "c-sharp"

// "F♯" -> letter "F", d = 1  |  "B♭" -> letter "B", d = -1
function parseNote(name) {
  const d = (name.match(/♯/g) || []).length - (name.match(/♭/g) || []).length;
  return { name, letter: name[0], d };
}

// JSON that is safe to put inside a <script> tag
const safeJSON = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

/* ---------- The notes for each page type ---------- */

function scaleData(key, form = "natural") {
  if (key.type === "minor") {
    // the notes come from the same formula as the major scales (scales-data.js); the fingering is in keys-data.js
    const root = rootFor(key);
    const s = spellScale(root.letter, root.semi, MINOR_STEPS[form]);
    const fingering = (key.forms && key.forms[form]) || key.scale;
    return {
      notes: s.notes.map((n, i) => ({ ...parseNote(n), abs: s.semis[i] })),
      rh: fingering.rh,
      lh: fingering.lh,
    };
  }
  const s = MAJOR_SCALES[key.scaleIndex];
  // G♭ major (`altRoot`) plays the keys of F♯ major: the same fingering, the notes spelled from its own root
  const spelled = key.altRoot ? spellScale(rootFor(key).letter, rootFor(key).semi) : s;
  return {
    notes: spelled.notes.map((n, i) => ({ ...parseNote(n), abs: spelled.semis[i] })),
    rh: s.rh,
    lh: s.lh,
  };
}

function arpeggioData(key) {
  const tones = spellChord(rootFor(key), triadFor(key));
  const notes = [...tones, { ...tones[0], abs: tones[0].abs + 12 }]; // root again, an octave up
  return {
    notes: notes.map((n) => ({ name: n.name, letter: n.letter, d: n.d, abs: n.abs })),
    ...key.arpeggio,
  };
}

// One octave, plus the same thing over two octaves. For two octaves the second octave repeats the notes
// (the middle note is shared), and the fingering follows the usual pattern:
//   right hand: the middle note takes the starting finger of the pattern (usually the thumb, instead of 5), so
//               the hand can keep going: first octave without its last number, then the whole pattern again
//   left hand:  the whole pattern, then the pattern again without its first number
// If a key needs something different, give it by hand in keys-data.js as `twoOctave: { scale: { rh, lh }, arpeggio: { rh, lh } }`.
function withTwoOctaves(one, override) {
  const second = one.notes.slice(1).map((n) => ({ ...n, abs: n.abs + 12 }));
  return {
    1: one,
    2: {
      notes: [...one.notes, ...second],
      rh: (override && override.rh) || [...one.rh.slice(0, -1), ...one.rh],
      lh: (override && override.lh) || [...one.lh, ...one.lh.slice(1)],
    },
  };
}

function chordData(key) {
  const tones = spellChord(rootFor(key), triadFor(key));
  const strip = (n) => ({ name: n.name, letter: n.letter, d: n.d, abs: n.abs, root: n.root, label: n.label });
  return INVERSION_NAMES.map((label, inv) => ({
    label,
    rh: { notes: voiceChord(tones, inv, "rh").map(strip), fingers: key.chord.rh[inv] },
    lh: { notes: voiceChord(tones, inv, "lh").map(strip), fingers: key.chord.lh[inv] },
  }));
}

/* ---------- The fingering block (written into the page) ---------- */

// A small table: the notes across the top, then one row per hand with a finger number under each note.
// The thumb (finger 1) is marked so the thumb-under and hand-shift points stand out.
function fingerTable(notes, rh, lh) {
  const head = notes.map((n) => `<th scope="col">${esc(n.name)}</th>`).join("");
  const row = (label, title, fingers) => `
            <tr>
              <th scope="row"><abbr title="${title}">${label}</abbr></th>${fingers.map((f) => `<td${f === 1 ? ' class="thumb"' : ""}>${f}</td>`).join("")}
            </tr>`;
  return `
          <table class="finger-grid" style="--cols:${notes.length}">
            <thead>
              <tr><th scope="col"><span class="sr-only">Hand</span></th>${head}</tr>
            </thead>
            <tbody>${row("RH", "Right hand", rh)}${row("LH", "Left hand", lh)}
            </tbody>
          </table>`;
}

const LEGEND = "RH is the right hand and LH the left hand. Finger 1 is the thumb (shown in colour) and 5 is the little finger.";

// the 1 octave / 2 octaves switch. It appears in several sections; they all stay in step.
const octaveSeg = () => `
                <div class="seg" data-key="octaves" role="group" aria-label="Octaves">
                  <button type="button" data-v="1">1 octave</button>
                  <button type="button" data-v="2">2 octaves</button>
                </div>`;

// Scale and arpeggio: one table for one octave, one table for two octaves (the second octave simply carries on
// in the same table). Both are in the page; the switch shows one of them. The wrapper lets a long table scroll
// sideways on a phone instead of squashing the numbers.
function melodicFingering(oct, caption) {
  const view = (n) => `
            <div class="finger-view" data-octaves="${n}"${n === 1 ? "" : " hidden"}>
              <div class="finger-scroll">${fingerTable(oct[n].notes, oct[n].rh, oct[n].lh)}
              </div>
            </div>`;
  return `
        <section class="fingering">
          <div class="fingering-card">
            <div class="card-head">
              <h2>Fingering</h2>${octaveSeg()}
            </div>${view(1)}${view(2)}
            <p class="finger-note">${caption} ${LEGEND}</p>
          </div>
        </section>`;
}

function chordFingering(inversions) {
  const blocks = inversions.map((inv) => `
          <div class="finger-block">
            <h3>${inv.label}</h3>${fingerTable(inv.rh.notes, inv.rh.fingers, inv.lh.fingers)}
          </div>`).join("");
  return `
        <section class="fingering">
          <div class="fingering-card">
            <div class="card-head">
              <h2>Fingering</h2>
            </div>
            <div class="finger-blocks three">${blocks}
            </div>
            <p class="finger-note">Notes are listed from lowest to highest. ${LEGEND}</p>
          </div>
        </section>`;
}

/* ---------- The sheet music and keyboard sections (filled in by js/key-page.js) ---------- */

// Scale and arpeggio: the sheet music card (hands, octaves, fingering) and the keyboard card, which shows the
// same notes and finger numbers on a keyboard.
const melodicSections = () => `
        <section class="practice">
          <div class="practice-card">
            <div class="card-head">
              <h2>Sheet music</h2>
            </div>

            <div class="options options-row">
              <div class="option">
                <span class="option-label">Hands</span>
                <div class="seg" data-key="hands" role="group" aria-label="Hands">
                  <button type="button" data-v="both">Both</button>
                  <button type="button" data-v="rh">Right</button>
                  <button type="button" data-v="lh">Left</button>
                </div>
              </div>
              <div class="option">
                <span class="option-label">Octaves</span>${octaveSeg()}
              </div>
              <div class="option">
                <span class="option-label">Fingering</span>
                <div class="seg" data-key="fingers" role="group" aria-label="Fingering numbers">
                  <button type="button" data-v="on">Show</button>
                  <button type="button" data-v="off">Hide</button>
                </div>
              </div>
            </div>

            <div class="score" id="main-score"></div>
          </div>
        </section>

        <section class="practice">
          <div class="practice-card">
            <div class="card-head">
              <h2>On the keyboard</h2>${octaveSeg()}
            </div>

            <div class="kb-blocks" id="keyboards"></div>
          </div>
        </section>`;

// A scale is a long line of notes, so its two cards stack. An arpeggio is short, so on a desktop its two cards
// sit side by side, like the chord page (see .practice-pair-arp in keys.css).
const scaleViewer = melodicSections;
const arpeggioViewer = () => `
        <div class="practice-pair practice-pair-arp">${melodicSections()}
        </div>`;

// Chord: hand and inversion with the sheet music, how to play it with the keyboard. The two cards sit side by
// side on a wide screen (see .practice-pair in keys.css).
const chordViewer = () => `
        <div class="practice-pair practice-pair-chord">
          <section class="practice">
            <div class="practice-card">
              <div class="card-head">
                <h2>Sheet music</h2>
              </div>

              <div class="options">
                <div class="option">
                  <span class="option-label">Hands</span>
                  <div class="seg" data-key="hands" role="group" aria-label="Hands">
                    <button type="button" data-v="both">Both</button>
                    <button type="button" data-v="rh">Right</button>
                    <button type="button" data-v="lh">Left</button>
                  </div>
                </div>
                <div class="option option-wide">
                  <span class="option-label">Inversion</span>
                  <div class="seg" id="inv-seg" data-key="inv" role="group" aria-label="Inversion"></div>
                </div>
              </div>

              <div class="score chord-score" id="chord-score"></div>
            </div>
          </section>

          <section class="practice">
            <div class="practice-card">
              <div class="card-head">
                <h2>On the keyboard</h2>
              </div>

              <div class="kb-blocks" id="chord-keys"></div>
            </div>
          </section>
        </div>`;

/* ---------- The three page types ---------- */

const MELODIC_CAPTION = "Going up. Coming down, use the same fingers in reverse order. In two octaves the middle note is fingered differently so your hand can carry on.";
const MELODIC_MINOR_CAPTION = "Going up. Coming down, play the natural minor scale (the 6th and 7th notes go back down) with the same fingers in reverse order. In two octaves the middle note is fingered differently so your hand can carry on.";

// `path` is the folder under /keys/<key>/ ("" is the key's main page)
const SCALE_FORMS = {
  major: { tab: "Scale", path: "" },
  natural: { tab: "Natural", path: "" }, // a minor key's main page
  harmonic: { tab: "Harmonic", path: "harmonic/" },
  melodic: { tab: "Melodic", path: "melodic/" },
};

// The scale page: `form` is "major" for a major key, or "natural", "harmonic" or "melodic" for a minor key.
function scalePage(form) {
  return {
    ...SCALE_FORMS[form],
    section: "scales",
    build(key) {
      const minor = form !== "major";
      const d = withTwoOctaves(scaleData(key, form), key.twoOctave && key.twoOctave.scale);
      const one = d[1];
      const name = minor ? `${key.name.split(" ")[0]} ${form} minor` : key.name; // "A harmonic minor"
      const raised = form === "harmonic" ? `, with the 7th note raised (${one.notes[6].name})`
        : form === "melodic" ? `, with the 6th and 7th notes raised on the way up (${one.notes[5].name} and ${one.notes[6].name})` : "";
      const back = form === "melodic"
        ? ". Coming down, play the natural minor scale (the 6th and 7th notes go back down) with the same fingers in reverse."
        : ", then come back down the same way in reverse.";
      return {
        title: `${cap(name)} Scale Fingering for Both Hands | PianoGuide`,
        description: `How to finger the ${name} scale on piano: right hand ${list(one.rh)}, left hand ${list(one.lh)}. One or two octaves, with sheet music and keyboard diagrams.`,
        heading: `${cap(name)} scale fingering`,
        intro: `The ${name} scale has ${key.signature}${raised}. Play one octave going up with the right hand on ${list(one.rh)} and the left hand on ${list(one.lh)}${back}`,
        fingering: melodicFingering(d, form === "melodic" ? MELODIC_MINOR_CAPTION : MELODIC_CAPTION),
        viewer: scaleViewer(),
        data: { mode: "melodic", name, keySig: key.keySig, octaves: d, octaveShift: key.octaveShift || {} },
      };
    },
  };
}

const ARPEGGIO_PAGE = {
  tab: "Arpeggio", path: "arpeggio/", section: "arpeggios",
  build(key) {
    const d = withTwoOctaves(arpeggioData(key), key.twoOctave && key.twoOctave.arpeggio);
    const one = d[1];
    const name = key.name;
    return {
      title: `${cap(name)} Arpeggio Fingering on Piano | PianoGuide`,
      description: `How to finger the ${name} arpeggio on piano: right hand ${list(one.rh)}, left hand ${list(one.lh)}. One or two octaves, with sheet music and keyboard diagrams.`,
      heading: `${cap(name)} arpeggio fingering`,
      intro: `The ${name} arpeggio plays the notes of the ${name} chord (${list(one.notes.slice(0, 3).map((n) => n.name))}) one at a time, then the root again an octave higher. Use ${list(one.rh)} in the right hand and ${list(one.lh)} in the left hand.`,
      fingering: melodicFingering(d, MELODIC_CAPTION),
      viewer: arpeggioViewer(),
      data: { mode: "melodic", name, keySig: null, octaves: d, octaveShift: key.octaveShift || {} }, // no key signature for arpeggios: every sharp and flat is written by its note
    };
  },
};

const CHORD_PAGE = {
  tab: "Chord", path: "chord/", section: "chords",
  build(key) {
    const inv = chordData(key);
    const name = key.name;
    const names = list(inv[0].rh.notes.map((n) => n.name));
    const root = name.split(" ")[0]; // "C♯ minor" -> "C♯"
    return {
      title: `${cap(name)} Chord on Piano: Notes and Fingering | PianoGuide`,
      description: `The ${name} chord on piano: notes ${names}, with fingering for both hands in root position and both inversions.`,
      heading: `${cap(name)} chord fingering`,
      intro: `The ${name} chord has the notes ${names}. In root position the right hand plays ${list(inv[0].rh.fingers)} and the left hand plays ${list(inv[0].lh.fingers)}. The fingering below covers root position and both inversions.`,
      // the chord explorer opens on this chord, with the 7th, sus and other chords on the same root a click away
      heroExtra: `
            <p class="hero-more"><a class="text-link" href="/chords/?root=${noteSlug(root)}&amp;type=${key.type === "minor" ? "minor" : "major"}">All chords on ${esc(root)}: 7th, sus, diminished and more</a></p>`,
      fingering: chordFingering(inv),
      viewer: chordViewer(),
      data: { mode: "chord", name, inversions: inv },
    };
  },
};

// The pages (and tabs) of a key: a major key has three, a minor key five.
const pagesFor = (key) => key.type === "minor"
  ? [scalePage("natural"), scalePage("harmonic"), scalePage("melodic"), ARPEGGIO_PAGE, CHORD_PAGE]
  : [scalePage("major"), ARPEGGIO_PAGE, CHORD_PAGE];

/* ---------- The chromatic scale ---------- */

// One page for the whole chromatic scale; "Start on" buttons pick the first note. The notes and fingering for every
// start note are in the page, so the buttons work instantly. Fingering: thumb on white keys, finger 3 on black keys,
// except where two white keys sit side by side (E-F and B-C), going up:
//   right hand: thumb on E or B, finger 2 on the F or C after it
//   left hand:  finger 2 on E or B (when an F or C follows), thumb on the F or C
// The first or last note of the scale keeps the thumb when its partner key is not part of the scale.
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // semitones above C
// [id, button label, semitone of the start note, spell the black keys with flats?] Sharps for the keys that use
// sharps (C G D A E B F♯), flats for the others.
const CHROMATIC_STARTS = [
  ["C", "C", 0, false], ["Db", "C♯/D♭", 1, true], ["D", "D", 2, false], ["Eb", "D♯/E♭", 3, true],
  ["E", "E", 4, false], ["F", "F", 5, true], ["Fs", "F♯/G♭", 6, false], ["G", "G", 7, false],
  ["Ab", "G♯/A♭", 8, true], ["A", "A", 9, false], ["Bb", "A♯/B♭", 10, true], ["B", "B", 11, false],
];

function chromaticOctaves(semi, flats) {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  const make = (count) => {
    const notes = Array.from({ length: count }, (_, i) => ({ ...parseNote(names[(semi + i) % 12]), abs: semi + i }));
    const pc = (i) => notes[i].abs % 12;
    const isBlack = (i) => BLACK_KEYS.includes(pc(i));
    const rh = notes.map((n, i) => {
      if (isBlack(i)) return 3;
      return i > 0 && [5, 0].includes(pc(i)) && [4, 11].includes(pc(i - 1)) ? 2 : 1; // F or C right after E or B
    });
    const lh = notes.map((n, i) => {
      if (isBlack(i)) return 3;
      return i < notes.length - 1 && [4, 11].includes(pc(i)) && [5, 0].includes(pc(i + 1)) ? 2 : 1; // E or B right before F or C
    });
    return { notes, rh, lh };
  };
  return { 1: make(13), 2: make(25) };
}

const CHROMATIC_CAPTION = "Thumb on the white keys and finger 3 on the black keys. At E–F and B–C the right hand plays the thumb on E or B and finger 2 on F or C, and the left hand plays finger 2 on E or B and the thumb on F or C. Coming down, use the same fingers in reverse. In two octaves the pattern simply repeats.";

function chromaticPage() {
  const variants = {};
  for (const [id, , semi, flats] of CHROMATIC_STARTS) {
    const octaves = chromaticOctaves(semi, flats);
    variants[id] = { name: `Chromatic scale starting on ${octaves[1].notes[0].name}`, octaves };
  }
  const buttons = CHROMATIC_STARTS.map(([id, label]) => `            <button type="button" data-v="${id}">${label}</button>`).join("\n");
  return {
    title: "Chromatic Scale on Piano: Fingering and How to Play It | PianoGuide",
    description: "How to play the chromatic scale on piano starting on any note: thumb on the white keys, third finger on the black keys, and a change of finger at E–F and B–C.",
    heading: "Chromatic scale fingering",
    intro: "A chromatic scale plays every key in turn, black and white, going up one semitone at a time until you reach the same note an octave higher. Pick any starting note below: the fingering follows the same pattern whichever note you start on.",
    heroExtra: `
            <ol class="how-to">
                <li><strong>Thumb on white keys, third finger on black keys.</strong> Fingers 1 and 3 do most of the work, so your hand stays calm and close to the keys.</li>
                <li><strong>Where two white keys sit side by side</strong> (E–F and B–C), the hands change finger. Right hand: thumb on E or B, then finger 2 on F or C. Left hand: finger 2 on E or B, then thumb on F or C.</li>
                <li><strong>Coming down, use the same fingers in reverse.</strong> Start slowly and keep your wrist loose.</li>
            </ol>`,
    tabnav: `        <div class="key-tabs pills" data-key="start" role="group" aria-label="Start on">
            <span class="tabs-label">Start on</span>
${buttons}
        </div>`,
    fingering: melodicFingering(variants.C.octaves, CHROMATIC_CAPTION),
    viewer: scaleViewer(),
    data: { mode: "melodic", start: "C", keySig: null, variants },
  };
}

/* ---------- Checking keys-data.js ---------- */

// The indexes in keys-data.js point into scales-data.js and chords-data.js. If one is off by a place, a page would
// quietly show the wrong key, so the build stops and says which key to fix.
function checkKey(key) {
  const minor = key.type === "minor";
  const root = key.name.split(" ")[0]; // "F♯ major" -> "F♯"
  const problems = [];
  if (minor) {
    for (const hand of ["rh", "lh"]) {
      if (!key.scale || !key.scale[hand] || key.scale[hand].length !== 8) problems.push(`scale needs 8 numbers in each hand`);
    }
    if (!key.keySig || !key.keySig.endsWith("m")) problems.push('keySig for a minor key looks like "Am" or "F#m"');
    // for a minor key `name` must say "minor": "A minor"
    if (!/ minor$/.test(key.name)) problems.push('name must end in " minor"');
  } else {
    const scale = MAJOR_SCALES[key.scaleIndex];
    const first = scale && (key.altRoot ? scale.alt && scale.alt.name : scale.notes[0]);
    if (first !== root) {
      problems.push(`scaleIndex ${key.scaleIndex} is ${scale ? `the ${scale.notes[0]} major scale` : "past the end of MAJOR_SCALES"}, not ${root}`);
    }
  }
  const rootSpec = rootFor(key);
  const chordRoot = rootSpec && spellChord(rootSpec, triadFor(key))[0].name;
  if (chordRoot !== root) {
    problems.push(`rootIndex ${key.rootIndex}${key.altRoot ? " (altRoot)" : ""} is ${chordRoot || "missing in CHORD_ROOTS"}, not ${root}`);
  }
  if (key.arpeggio.rh.length !== 4 || key.arpeggio.lh.length !== 4) problems.push("arpeggio needs 4 numbers in each hand");
  for (const hand of ["rh", "lh"]) {
    if (key.chord[hand].length !== 3 || key.chord[hand].some((f) => f.length !== 3)) problems.push(`chord ${hand} needs 3 inversions of 3 numbers`);
  }
  if (problems.length) throw new Error(`keys-data.js, ${key.name}: ${problems.join("; ")}`);
}
KEYS.forEach(checkKey);

/* ---------- The pages ---------- */

// What the hand-written pages can use as {{...}}:
//   keyLinks   for the chords page: the key page of each major and minor triad, as JSON
//              { "<CHORD_ROOTS index>:<major|minor>": { url, name } }
const siteVars = {
  keyLinks: safeJSON(Object.fromEntries(KEYS.map((key) => [
    `${key.rootIndex}:${key.type === "minor" ? "minor" : "major"}`,
    { url: `/keys/${key.slug}/chord/`, name: cap(key.name) },
  ]))),
};

// The hand-written pages: src/pages/chords/index.html -> /chords/, src/pages/404.html -> /404.html
for (const rel of fs.readdirSync(path.join(SRC, "pages"), { recursive: true }).sort()) {
  if (!rel.endsWith(".html")) continue;
  const out = rel.split(path.sep).join("/");
  const url = "/" + out.replace(/(^|\/)index\.html$/, "$1");
  addPage(url, out, readPage(path.join(SRC, "pages", rel)), siteVars);
}

// The notes of a key's signature: its major scale, or for a minor key its natural minor scale
const signatureNotes = (key) => scaleData(key).notes.slice(0, 7);
const isMinor = (key) => key.type === "minor";

// A major key and its relative minor have the same key signature (C major and A minor). Every key page links to
// the same page of its relative key: scale to scale (any minor form to the major scale), arpeggio to arpeggio.
const sameSignature = (a, b) => signatureNotes(a).map((n) => n.name).sort().join() === signatureNotes(b).map((n) => n.name).sort().join();
const relativeOf = (key) => KEYS.find((k) => isMinor(k) !== isMinor(key) && sameSignature(k, key));

function relativeLine(key, page) {
  const rel = relativeOf(key);
  if (!rel) return "";
  const path = page.section === "scales" ? "" : page.path;
  return `
            <p class="hero-more">Relative ${isMinor(rel) ? "minor" : "major"}: <a class="text-link" href="/keys/${rel.slug}/${path}">${esc(cap(rel.name))}</a>, with the same key signature</p>`;
}

// The key pages. Each one belongs to a section of the menu (a scale page to Scales, an arpeggio page to Arpeggios,
// a chord page to Chords): that menu item is marked, and the breadcrumb starts with it.
const keyTemplate = readPage(path.join(SRC, "templates", "key.html"));

function addKeyPage({ url, keyUrl, keyName, section, tabnav, out }) {
  const [, sectionUrl, sectionName] = NAV.find(([id]) => id === section);
  addPage(url, `${url.slice(1)}index.html`, { ...keyTemplate, meta: { ...keyTemplate.meta, nav: section, title: out.title, description: out.description } }, {
    sectionUrl,
    sectionName,
    keyUrl,
    keyName: esc(keyName),
    heading: esc(out.heading),
    intro: esc(out.intro),
    heroExtra: out.heroExtra || "",
    tabnav,
    fingering: out.fingering,
    viewer: out.viewer,
    data: safeJSON(out.data),
  });
}

for (const key of KEYS) {
  const keyUrl = `/keys/${key.slug}/`;
  const keyPages = pagesFor(key);

  for (const page of keyPages) {
    // the tab bar: links, so each tab is its own page
    const tabs = keyPages.map((p) => {
      const current = p.path === page.path ? ' aria-current="page"' : "";
      return `            <a href="${keyUrl}${p.path}"${current}>${p.tab}</a>`;
    }).join("\n");
    const tabnav = `        <nav class="key-tabs" aria-label="${esc(cap(key.name))} pages">\n${tabs}\n        </nav>`;
    const out = page.build(key);
    out.heroExtra = (out.heroExtra || "") + relativeLine(key, page);
    addKeyPage({ url: `${keyUrl}${page.path}`, keyUrl, keyName: cap(key.name), section: page.section, tabnav, out });
  }
}

// The chromatic scale: one page, not tied to a key
{
  const out = chromaticPage();
  addKeyPage({ url: "/keys/chromatic/", keyUrl: "/keys/chromatic/", keyName: "Chromatic scale", section: "scales", tabnav: out.tabnav, out });
}

/* ---------- The lists: /keys/, /scales/, /arpeggios/ ---------- */

// All three are built from src/templates/key-list.html: groups of cards, one card per key. The whole card links
// to `href`; `key` puts its root note in the round badge (filled for a major key, outlined for a minor one; no key
// shows the keyboard icon); `links` (optional) are small buttons on the card for the key's other pages, and
// `textLinks` (optional) a single line of plain links under the subtitle, which keeps the card small.
const listTemplate = readPage(path.join(SRC, "templates", "key-list.html"));

const badge = (key) => key
  ? `<span class="key-badge${key.type === "minor" ? " is-minor" : ""}" aria-hidden="true">${esc(key.name.split(" ")[0])}</span>`
  : `<span class="key-badge"><img src="/assets/icons/keys.svg" alt="" width="22" height="22"></span>`;

const card = ({ key, href, title, sub, links = [], textLinks = [] }) => `                <li class="key-card">
                    ${badge(key)}
                    <div class="key-text">
                        <h4><a href="${href}">${esc(title)}</a></h4>
                        <p class="key-sig">${esc(sub)}</p>${textLinks.length ? `
                        <p class="key-text-links">${textLinks.map(([label, url]) => `<a href="${url}">${label}</a>`).join('<span aria-hidden="true"> · </span>')}</p>` : ""}
                    </div>${links.length ? `
                    <div class="key-links">
                        ${links.map(([label, url]) => `<a href="${url}">${label}</a>`).join("\n                        ")}
                    </div>` : ""}
                </li>`;

// A group: a heading, then one or more rows of cards, each row with an optional small label.
// "Major scales" -> <div id="major-scales">, so the homepage can link straight to a group.
const group = (title, rows) => `            <div class="key-group" id="${title.toLowerCase().replace(/ /g, "-")}">
                <h2 class="key-group-title">${title}</h2>${rows.filter(([, cards]) => cards.length).map(([label, cards]) => `${label ? `
                <h3 class="key-row-title">${label}</h3>` : ""}
                <ul class="key-grid">
${cards.join("\n")}
                </ul>`).join("")}
            </div>`;

// The keys of a group split the way they are taught: the key with no sharps or flats, then the sharp keys, then
// the flat keys, each row in learning order.
const keyGroup = (title, keys, toCard) => group(title, [
  ["No sharps or flats", keys.filter((k) => keyFamily(k) === "none")],
  ["Sharps", keys.filter((k) => keyFamily(k) === "sharps")],
  ["Flats", keys.filter((k) => keyFamily(k) === "flats")],
].map(([label, ks]) => [label, ks.map(toCard)]));

function addList({ url, nav, title, description, heading, intro, groups }) {
  addPage(url, `${url.slice(1)}index.html`, { ...listTemplate, meta: { ...listTemplate.meta, nav, title, description } }, {
    heading: esc(heading),
    intro: esc(intro),
    groups: groups.filter(Boolean).join("\n"),
  });
}

// The lists show the keys in the order they are learnt: no sharps or flats first, then one sharp, one flat, two
// sharps, two flats... (C, G, F, D, B♭ ... for the major keys). The count comes from the key's own scale.
const keyFamily = (key) => {
  const notes = signatureNotes(key);
  return notes.some((n) => n.d < 0) ? "flats" : notes.some((n) => n.d > 0) ? "sharps" : "none";
};
function learningOrder(key) {
  const count = signatureNotes(key).filter((n) => n.d !== 0).length;
  return count * 2 + (keyFamily(key) === "flats" ? 1 : 0); // sharps before flats
}
const byLearningOrder = (a, b) => learningOrder(a) - learningOrder(b);
const majorKeys = KEYS.filter((k) => !isMinor(k)).sort(byLearningOrder);
const minorKeys = KEYS.filter(isMinor).sort(byLearningOrder);
const keyPageUrl = (key, page = "") => `/keys/${key.slug}/${page}`;
const chromaticCard = card({ href: "/keys/chromatic/", title: "Chromatic scale", sub: "Every black and white key, starting on any note" });

// /keys/: every key with links to all of its pages
{
  const keyCard = (key) => card({
    key,
    href: keyPageUrl(key),
    title: cap(key.name),
    sub: cap(key.signature),
    links: pagesFor(key).map((p) => [p.tab, keyPageUrl(key, p.path)]),
  });
  addList({
    url: "/keys/",
    nav: "keys",
    title: "Piano Keys: Scales, Arpeggios and Chords | PianoGuide",
    description: "Choose a major or minor key to see its scales, arpeggio and chord with fingering, sheet music and keyboard diagrams.",
    heading: "Piano keys",
    intro: "Choose a major or minor key to see its scales, arpeggio and chord, with the fingering, the sheet music and the keys on a keyboard.",
    groups: [
      keyGroup("Major keys", majorKeys, keyCard),
      keyGroup("Minor keys", minorKeys, keyCard),
      group("Other scales", [[null, [chromaticCard]]]),
    ],
  });
}

// /scales/: each card opens the scale; a minor key also links to its three forms
addList({
  url: "/scales/",
  nav: "scales",
  title: "Piano Scales: Fingering for Every Major and Minor Scale | PianoGuide",
  description: "Every major and minor piano scale (natural, harmonic and melodic) with fingering for both hands, sheet music and keyboard diagrams.",
  heading: "Piano scales",
  intro: "Choose a scale to see its fingering for both hands, one or two octaves, with the sheet music and the keys on a keyboard.",
  groups: [
    keyGroup("Major scales", majorKeys, (key) => card({ key, href: keyPageUrl(key), title: `${cap(key.name)} scale`, sub: cap(key.signature) })),
    keyGroup("Minor scales", minorKeys, (key) => card({
      key,
      href: keyPageUrl(key),
      title: `${cap(key.name)} scale`,
      sub: cap(key.signature),
      textLinks: ["natural", "harmonic", "melodic"].map((form) => [SCALE_FORMS[form].tab, keyPageUrl(key, SCALE_FORMS[form].path)]),
    })),
    group("Other scales", [[null, [chromaticCard]]]),
  ],
});

// /arpeggios/: each card opens the arpeggio
{
  const arpCard = (key) => card({
    key,
    href: keyPageUrl(key, ARPEGGIO_PAGE.path),
    title: `${cap(key.name)} arpeggio`,
    sub: cap(key.signature),
  });
  addList({
    url: "/arpeggios/",
    nav: "arpeggios",
    title: "Piano Arpeggios: Fingering for Every Major and Minor Key | PianoGuide",
    description: "Every major and minor piano arpeggio with fingering for both hands, one or two octaves, with sheet music and keyboard diagrams.",
    heading: "Piano arpeggios",
    intro: "Choose an arpeggio to see its fingering for both hands, one or two octaves, with the sheet music and the keys on a keyboard.",
    groups: [
      keyGroup("Major arpeggios", majorKeys, arpCard),
      keyGroup("Minor arpeggios", minorKeys, arpCard),
    ],
  });
}

/* ---------- Writing the files ---------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(PUBLIC, DIST, { recursive: true, filter: (src) => path.basename(src) !== ".DS_Store" });

for (const page of pages) {
  const file = path.join(DIST, page.out);
  if (fs.existsSync(file)) throw new Error(`two pages write ${page.out}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page.html);
}

const listed = pages.filter((p) => p.sitemap).sort((a, b) => a.url.localeCompare(b.url));
fs.writeFileSync(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((p) => `  <url><loc>${SITE_URL}${p.url}</loc></url>`).join("\n")}
</urlset>
`);

// for the search page: the title (without "| PianoGuide") and description of every page in the sitemap
fs.writeFileSync(path.join(DIST, "search-index.json"),
  JSON.stringify(listed.map((p) => ({ url: p.url, title: p.title.replace(/\s*\|\s*PianoGuide$/, ""), description: p.description }))));

/* ---------- Checking the links ---------- */

// Every href="/..." and src="/..." must lead to a file in /dist/ (a folder link needs its index.html).
const broken = [];
for (const page of pages) {
  for (const [, link] of page.html.matchAll(/(?:href|src)="(\/(?!\/)[^"#?]*)/g)) {
    const file = path.join(DIST, decodeURI(link));
    const ok = link.endsWith("/") ? fs.existsSync(path.join(file, "index.html"))
      : fs.existsSync(file) && fs.statSync(file).isFile();
    if (!ok) broken.push(`  ${page.url} -> ${link}`);
  }
}

console.log(`Built ${pages.length} pages into dist/ (${listed.length} in sitemap.xml)`);
if (broken.length) {
  console.error(`\n${broken.length} broken link${broken.length > 1 ? "s" : ""}:\n${[...new Set(broken)].join("\n")}`);
  process.exitCode = 1;
}
