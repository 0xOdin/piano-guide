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
//                      scripts: vexflow chords      /js/<name>.js after main.js and search.js ("vexflow" is the CDN copy)
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
// plus the chromatic scale at /keys/chromatic/, the lists and fingering charts at /scales/ and /arpeggios/, and
// /sitemap.xml (not while the site is hidden from search engines: HIDDEN_FROM_SEARCH below).
// Finally every link to a page or file on the site is checked, and the build fails if one of them goes nowhere.
//
// Run it with   npm run build   (or npm run dev to build, serve and rebuild on every change).
// It needs only Node.js, no packages. The fingering is written into the HTML itself, so search engines (and
// people with JavaScript off) see it. The sheet music and keyboard are added in the browser by public/js/key-page.js.
//
// Set SITE_URL to your real address before you publish (SITE_URL=https://... npm run build): it goes into the
// canonical links and the sitemap. If the site lives in a folder of that address, as GitHub Pages puts a project
// (https://you.github.io/piano-guide/), set BASE_PATH to the folder too (BASE_PATH=/piano-guide): it goes in front of
// every link to a page or file on the site, in the pages, their data and the stylesheets. Without it, nothing changes.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const diagrams = require("./diagrams.js");

const SITE_URL = (process.env.SITE_URL || "https://example.com").replace(/\/$/, "");
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/+$/, "").replace(/^(?=[^/])/, "/"); // "" or "/piano-guide"
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
// While true, every page asks search engines not to list it (<meta name="robots" content="noindex">) and there is no
// sitemap.xml: the site is public, but not found by searching. Set it to false to let search engines list it.
const HIDDEN_FROM_SEARCH = true;

/* ---------- Pages and the layout ---------- */

// Puts BASE_PATH in front of the site's own links: href, src and action attributes that start with one /, and the
// "url" fields of the page data the scripts read (the chords and keyboard pages link to key pages with them)
const withBase = (html) => !BASE_PATH ? html : html
  .replace(/(href|src|action)="\/(?!\/)/g, `$1="${BASE_PATH}/`)
  .replace(/"url":"\/(?!\/)/g, `"url":"${BASE_PATH}/`);

// The menu in the header and the footer: [nav id, url, label]
const NAV = [
  ["scales", "/scales/", "Scales"],
  ["arpeggios", "/arpeggios/", "Arpeggios"],
  ["chords", "/chords/", "Chords"],
  ["theory", "/theory/", "Theory"],
  ["keyboard", "/keyboard/", "Keyboard"],
  ["practice", "/practice/", "Practice"],
  ["metronome", "/metronome/", "Metronome"],
];
// VexFlow 4.2.5 (draws the sheet music; MIT licence, beside it in /js/vendor/), served from the site, not a CDN
const SCRIPT_URLS = { vexflow: "/js/vendor/vexflow.js" };

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
    robots: HIDDEN_FROM_SEARCH ? '\n    <meta name="robots" content="noindex">' : "",
    canonical: SITE_URL + url,
    styles: ["main", ...words(meta.styles)].map((n) => `    <link rel="stylesheet" href="/css/${n}.css">`).join("\n"),
    nav: navList(meta.nav),
    footerNav: navList(null),
    content: fill(body.replace(/\s+$/, ""), vars, file),
    scripts: ["main", "search", ...words(meta.scripts)].map((n) => `    <script src="${SCRIPT_URLS[n] || `/js/${n}.js`}"></script>`).join("\n"),
    year: new Date().getFullYear(),
  }, "src/layout.html");
  pages.push({ url, out, html: withBase(html), title: meta.title, description: meta.description, sitemap: meta.sitemap !== "no" });
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
// the keyboards on the intervals page are drawn by the same code as the key pages' (public/js/piano-keys.js)
const { pianoKeysHTML } = loadScript(path.join(PUBLIC, "js", "piano-keys.js"), ["pianoKeysHTML"]);
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

// Page titles and descriptions also spell sharps and flats out in words, the way people type them into a search:
// "C♯ minor" is found by "c sharp minor" as well as "c♯ minor".
const titleCase = (s) => s.replace(/(^|\s)([a-z])/g, (_, space, c) => space + c.toUpperCase()); // "C♯ minor" -> "C♯ Minor"
const inWords = (name) => name.replace(/♯/g, " sharp").replace(/♭/g, " flat"); // "C♯ minor" -> "C sharp minor"
const hasAccidental = (name) => /[♯♭]/.test(name);
const alsoInWords = (name) => (hasAccidental(name) ? ` (${inWords(name)})` : ""); // " (C sharp minor)" or ""

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

// The foot of the keyboard case: a line saying what Play does, and Play itself, which plays what the keyboards show
// on the recorded piano, lighting each key and note as it sounds (key-page.js). Pressed again while playing, it stops.
const playFoot = (hint, indent) => `
${indent}<div class="case-foot">
${indent}  <span>${hint}</span>
${indent}  <button type="button" class="case-btn is-primary case-play" id="play-score">
${indent}    <svg class="play-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z"/></svg>
${indent}    <svg class="stop-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.6"/></svg>
${indent}    <span>Play</span>
${indent}  </button>
${indent}</div>`;
const UP_AND_DOWN = "Plays up and back down, with the hands and octaves shown.";

// Scale and arpeggio: the sheet music card (hands, octaves, fingering) and the keyboard card, which shows the
// same notes and finger numbers on a keyboard.
const melodicSections = (hint = UP_AND_DOWN) => `
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
          <div class="practice-card piano-case">
            <div class="card-head">
              <h2>On the keyboard</h2>${octaveSeg()}
            </div>

            <div class="kb-blocks" id="keyboards"></div>${playFoot(hint, "            ")}
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
            <div class="practice-card piano-case">
              <div class="card-head">
                <h2>On the keyboard</h2>
              </div>

              <div class="kb-blocks" id="chord-keys"></div>${playFoot("Plays the chord with the hands shown.", "              ")}
            </div>
          </section>
        </div>`;

/* ---------- The hero of a key page ---------- */

// Beside the heading, the key signature on a small stave (drawn by key-page.js from data-sig); under it, the notes
// as chips that sound when tapped, each with its place in the scale or chord. `notes`: [{ name, abs, degree }].
function keyHero(key, notes, what) {
  const sigWords = cap(key.signature.split(" (")[0]); // "Three sharps"
  return {
    sig: `
                <figure class="sig-tile">
                    <div class="sig-stave" id="hero-sig" data-sig="${key.keySig}" aria-label="Key signature: ${esc(key.signature)}"></div>
                    <figcaption>${esc(sigWords)}</figcaption>
                </figure>`,
    notes: `
            <ul class="note-chips" aria-label="${esc(cap(what))}, tap one to hear it">
${notes.map((n, i) => `                <li><button type="button" class="note-chip${i === 0 ? " is-root" : ""}" data-abs="${n.abs}" aria-label="${esc(n.name)}">${esc(n.name)}<small aria-hidden="true">${esc(n.degree)}</small></button></li>`).join("\n")}
            </ul>`,
  };
}

// a scale's notes numbered against the major scale on the same note: A natural minor is 1 2 ♭3 4 5 ♭6 ♭7
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const scaleDegrees = (notes) => notes.slice(0, 7).map((n, i) => {
  const diff = n.abs - notes[0].abs - MAJOR_STEPS[i];
  return { name: n.name, abs: n.abs, degree: `${diff < 0 ? "♭" : diff > 0 ? "♯" : ""}${i + 1}` };
});
// a triad's notes with their place in the chord (1 ♭3 5)
const chordDegrees = (key) => spellChord(rootFor(key), triadFor(key)).map((n) => ({ name: n.name, abs: n.abs, degree: n.label }));

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
        // "C♯ Minor Scale Fingering (C Sharp Natural Minor)", "A Minor Scale Fingering (Natural Minor)",
        // "C♯ Harmonic Minor Scale Fingering (C Sharp Harmonic Minor)", "C Major Scale Fingering for Both Hands"
        title: `${titleCase(form === "natural" ? key.name : name)} Scale Fingering${
          hasAccidental(name) ? ` (${titleCase(inWords(name))})` : form === "natural" ? " (Natural Minor)" : " for Both Hands"} | PianoGuide`,
        description: `How to finger the ${name}${alsoInWords(name)} scale on piano: right hand ${list(one.rh)}, left hand ${list(one.lh)}. One or two octaves, with sheet music and keyboard diagrams.`,
        heading: `${cap(name)} scale fingering`,
        intro: `The ${name} scale has ${key.signature}${raised}. Play one octave going up with the right hand on ${list(one.rh)} and the left hand on ${list(one.lh)}${back}`,
        fingering: melodicFingering(d, form === "melodic" ? MELODIC_MINOR_CAPTION : MELODIC_CAPTION),
        viewer: scaleViewer(form === "melodic" ? "Plays up, then back down as the natural minor." : UP_AND_DOWN),
        hero: keyHero(key, scaleDegrees(one.notes), `notes of the ${name} scale`),
        // melodic minor comes down as the natural minor: the notes the Play button plays on the way down
        data: { mode: "melodic", name, keySig: key.keySig, octaves: d, octaveShift: key.octaveShift || {},
          ...(form === "melodic" && { down: Object.fromEntries(Object.entries(withTwoOctaves(scaleData(key, "natural"))).map(([n, o]) => [n, o.notes.map((x) => x.abs)])) }) },
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
      title: `${titleCase(name)} Arpeggio Fingering${hasAccidental(name) ? ` (${titleCase(inWords(name))})` : " on Piano"} | PianoGuide`,
      description: `How to finger the ${name}${alsoInWords(name)} arpeggio on piano: right hand ${list(one.rh)}, left hand ${list(one.lh)}. One or two octaves, with sheet music and keyboard diagrams.`,
      heading: `${cap(name)} arpeggio fingering`,
      intro: `The ${name} arpeggio plays the notes of the ${name} chord (${list(one.notes.slice(0, 3).map((n) => n.name))}) one at a time, then the root again an octave higher. Use ${list(one.rh)} in the right hand and ${list(one.lh)} in the left hand.`,
      fingering: melodicFingering(d, MELODIC_CAPTION),
      viewer: arpeggioViewer(),
      hero: keyHero(key, chordDegrees(key), `notes of the ${name} arpeggio`),
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
      title: `${titleCase(name)} Chord on Piano: Notes and Fingering${hasAccidental(name) ? ` (${titleCase(inWords(name))})` : ""} | PianoGuide`,
      description: `The ${name}${alsoInWords(name)} chord on piano: notes ${names}, with fingering for both hands in root position and both inversions.`,
      heading: `${cap(name)} chord fingering`,
      intro: `The ${name} chord has the notes ${names}. In root position the right hand plays ${list(inv[0].rh.fingers)} and the left hand plays ${list(inv[0].lh.fingers)}. The fingering below covers root position and both inversions.`,
      // the chord explorer opens on this chord, with the 7th, sus and other chords on the same root a click away
      heroExtra: `
            <p class="hero-more"><a class="go-link" href="/chords/?root=${noteSlug(root)}&amp;type=${key.type === "minor" ? "minor" : "major"}">All chords on ${esc(root)}: 7th, sus, diminished and more</a></p>`,
      fingering: chordFingering(inv),
      viewer: chordViewer(),
      hero: keyHero(key, chordDegrees(key), `notes of the ${name} chord`),
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

// The notes of a key's signature: its major scale, or for a minor key its natural minor scale
const signatureNotes = (key) => scaleData(key).notes.slice(0, 7);
const isMinor = (key) => key.type === "minor";

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

// A major key and its relative minor have the same key signature (C major and A minor). Every key page links to
// the same page of its relative key: scale to scale (any minor form to the major scale), arpeggio to arpeggio.
const sameSignature = (a, b) => signatureNotes(a).map((n) => n.name).sort().join() === signatureNotes(b).map((n) => n.name).sort().join();
const relativeOf = (key) => KEYS.find((k) => isMinor(k) !== isMinor(key) && sameSignature(k, key));

// the major or minor key on the same root, spelled the same way (C major and C minor)
const parallelOf = (key) => KEYS.find((k) => isMinor(k) !== isMinor(key) && k.name.split(" ")[0] === key.name.split(" ")[0]);

// The same kind of page in another key: a scale page goes to that key's scale (a minor form, harmonic or melodic, to
// the same form when that key is minor too), an arpeggio to its arpeggio, a chord to its chord.
const samePageIn = (page, key) =>
  `/keys/${key.slug}/${page.section === "scales" ? (isMinor(key) ? page.path : "") : page.path}`;

// The keys related to this one: the relative key (the same key signature) and the parallel key (the same root)
function relativeLine(key, page) {
  const rel = relativeOf(key);
  const par = parallelOf(key);
  const link = (k) => `<a class="text-link" href="${samePageIn(page, k)}">${esc(cap(k.name))}</a>`;
  const parts = [];
  if (rel) parts.push(`Relative ${isMinor(rel) ? "minor" : "major"}: ${link(rel)}, with the same key signature`);
  if (par) parts.push(`Parallel ${isMinor(par) ? "minor" : "major"}: ${link(par)}, on the same root`);
  return parts.length ? `
            <p class="hero-more">${parts.join('<span class="hero-more-sep" aria-hidden="true"> · </span>')}</p>` : "";
}

// A menu of every key beside the tabs, opening the same kind of page in the key chosen (key-page.js). Its values
// carry the site's folder themselves (the build adds it to links, not to these).
function keySwitch(key, page) {
  const option = (k) => `<option value="${BASE_PATH}${samePageIn(page, k)}"${k === key ? " selected" : ""}>${esc(cap(k.name))}</option>`;
  return `
        <label class="key-switch">
            <span class="option-label">Key</span>
            <select id="key-switch">
                <optgroup label="Major keys">${majorKeys.map(option).join("")}</optgroup>
                <optgroup label="Minor keys">${minorKeys.map(option).join("")}</optgroup>
            </select>
        </label>`;
}

// The key pages. Each one belongs to a section of the menu (a scale page to Scales, an arpeggio page to Arpeggios,
// a chord page to Chords): that menu item is marked, and the breadcrumb starts with it.
const keyTemplate = readPage(path.join(SRC, "templates", "key.html"));

// The site's search (public/js/search.js) looks through these, written to /search-index.json at the end:
// { t: title, k: kind, s: a line under it, u: url, w: other words it can be found by (a symbol, a description),
//   a: (optional) the title spelled another way, found as readily as the title itself }.
// They are kept in the order they are added, which is the order results with the same score come in.
const searchEntries = [];
const SEARCH_KINDS = { scales: "Scale", arpeggios: "Arpeggio", chords: "Chord" };
// Keys with no page of their own under this spelling, found at the key that plays the same notes: "C♯ major" finds
// D♭ major. (F♯ and G♭ major, D♯ and E♭ minor each have pages in both spellings.)
const SAME_KEYS = {
  "D♭ major": "C♯ major", "E♭ major": "D♯ major", "A♭ major": "G♯ major", "B♭ major": "A♯ major", "B major": "C♭ major",
  "F♯ minor": "G♭ minor", "C♯ minor": "D♭ minor", "G♯ minor": "A♭ minor", "B♭ minor": "A♯ minor",
};

function addKeyPage({ url, keyUrl, keyName, section, tabnav, out }) {
  const [, sectionUrl, sectionName] = NAV.find(([id]) => id === section);
  addPage(url, `${url.slice(1)}index.html`, { ...keyTemplate, meta: { ...keyTemplate.meta, nav: section, title: out.title, description: out.description } }, {
    sectionUrl,
    sectionName,
    keyUrl,
    keyName: esc(keyName),
    // "A melodic minor scale fingering": the key large, what the page is for underneath
    heading: /^(.*?) ((?:scale |arpeggio |chord )?fingering)$/.test(out.heading)
      ? out.heading.replace(/^(.*?) ((?:scale |arpeggio |chord )?fingering)$/,
        (_, name, what) => `<span class="h1-name">${esc(name)}</span> <span class="h1-what">${esc(what)}</span>`)
      : esc(out.heading),
    heroSig: out.hero ? out.hero.sig : "",
    heroNotes: out.hero ? out.hero.notes : "",
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
    // the tab bar: links, so each tab is its own page. A thin line goes between every two tabs: a clear one after a
    // minor key's three scale forms, a faint one everywhere else.
    //   minor  Natural : Harmonic : Melodic | Arpeggio : Chord      major  Scale : Arpeggio : Chord
    const tabs = keyPages.map((p, i) => {
      const current = p.path === page.path ? ' aria-current="page"' : "";
      const prev = keyPages[i - 1];
      const clear = prev && isMinor(key) && prev.section === "scales" && p.section !== "scales";
      const divider = prev
        ? `            <span class="tab-divider${clear ? "" : " is-faint"}" aria-hidden="true"></span>\n` : "";
      return `${divider}            <a href="${keyUrl}${p.path}"${current}>${p.tab}</a>`;
    }).join("\n");
    const tabnav = `        <div class="key-nav">
        <nav class="key-tabs" aria-label="${esc(cap(key.name))} pages">\n${tabs}\n        </nav>${keySwitch(key, page)}
        </div>`;
    const out = page.build(key);
    out.heroExtra = relativeLine(key, page) + (out.heroExtra || ""); // the relative key first, then the page's own links
    addKeyPage({ url: `${keyUrl}${page.path}`, keyUrl, keyName: cap(key.name), section: page.section, tabnav, out });

    // for the search: a minor key's main page is its (natural) minor scale. A chord page is also found by its
    // symbol (Am, F♯m, D♭), and every page by the other spelling of its key, if it has one.
    const natural = page.path === "" && isMinor(key);
    const notes = out.data.mode === "chord" ? out.data.inversions[0].rh.notes : out.data.octaves[1].notes.slice(0, page.section === "scales" ? 7 : 3);
    const title = natural ? `${cap(key.name)} scale` : cap(out.heading.replace(/ fingering$/, ""));
    const root = key.name.split(" ")[0];
    const sameRoot = SAME_KEYS[key.name] && SAME_KEYS[key.name].split(" ")[0];
    const symbols = page.section === "chords" ? [root, sameRoot].filter(Boolean).map((r) => r + (isMinor(key) ? "m" : "")) : [];
    searchEntries.push({
      t: title,
      k: SEARCH_KINDS[page.section],
      s: `${notes.map((n) => n.name).join(" ")} · ${cap(key.signature.split(" (")[0])}`,
      u: `${keyUrl}${page.path}`,
      w: [key.name, natural ? "natural" : "", page.section === "chords" ? "triad" : "", ...symbols].filter(Boolean).join(" "),
      ...(sameRoot ? { a: title.replace(root, sameRoot) } : {}),
    });
  }
}

// The chromatic scale: one page, not tied to a key
{
  const out = chromaticPage();
  addKeyPage({ url: "/keys/chromatic/", keyUrl: "/keys/chromatic/", keyName: "Chromatic scale", section: "scales", tabnav: out.tabnav, out });
  searchEntries.push({ t: "Chromatic scale", k: "Scale", s: "Every key in turn, from any starting note", u: "/keys/chromatic/", w: "semitones half steps" });
}

// Every chord on every root, in the chord explorer (/chords/). A major or minor chord that has its own key page,
// spelled the same way, is found there instead.
{
  const keyChords = new Set(KEYS.map((key) => key.name)); // "C major", "F♯ minor"
  for (const type of CHORD_TYPES) {
    for (const root of CHORD_ROOTS) {
      const name = `${root.name} ${type.name}`;
      if (keyChords.has(name)) continue;
      const notes = spellChord(root, type).map((n) => n.name);
      searchEntries.push({
        t: `${name} chord`,
        k: "Chord",
        s: `${root.name}${type.symbol} · ${notes.join(" ")}`,
        u: `/chords/?root=${noteSlug(root.name)}&type=${type.tab.toLowerCase()}`,
        w: `${root.name}${type.symbol} ${type.symbol} ${type.tab} ${type.group}${root.alt ? ` ${root.alt.name}${type.symbol}` : ""}`,
        ...(root.alt ? { a: `${root.alt.name} ${type.name} chord` } : {}),
      });
    }
  }
}

// The other pages
searchEntries.push(
  { t: "Scales", k: "List", s: "Every major and minor scale, with fingering", u: "/scales/", w: "all scales major minor" },
  { t: "Arpeggios", k: "List", s: "Every major and minor arpeggio, with fingering", u: "/arpeggios/", w: "all arpeggios" },
  { t: "Scale fingering chart", k: "Chart", s: "Every scale's fingering on one page, to print", u: "/scales/fingering-chart/", w: "printable print table" },
  { t: "Arpeggio fingering chart", k: "Chart", s: "Every arpeggio's fingering on one page, to print", u: "/arpeggios/fingering-chart/", w: "printable print table" },
  { t: "Chords", k: "Chords", s: "Every chord on every root, with inversions", u: "/chords/", w: "chord explorer seventh sus diminished augmented inversion" },
  { t: "Theory", k: "Theory", s: "The ideas behind the scales and chords", u: "/theory/", w: "music theory" },
  { t: "Intervals", k: "Theory", s: "The distance between two notes, and how to name it", u: "/theory/intervals/", w: "interval semitone tone major minor perfect augmented diminished unison second third fourth fifth sixth seventh octave tritone" },
  { t: "Circle of fifths", k: "Theory", s: "Key signatures, relative minors, and the order of sharps and flats", u: "/theory/circle-of-fifths/", w: "key signature relative minor sharps flats" },
  { t: "Keyboard", k: "Tool", s: "Play two octaves, and light up any scale or chord", u: "/keyboard/", w: "piano online play keys" },
  { t: "Practice", k: "Tool", s: "Play or write what you are asked, and see what you got right", u: "/practice/", w: "quiz test drill microphone listen" },
  { t: "Metronome", k: "Tool", s: "Keep time, with tempo changes bar by bar", u: "/metronome/", w: "tempo bpm beat tap click time signature 2/4 3/4 4/4 6/8 9/8 12/8 count-in subdivide subdivision" },
  { t: "Privacy and terms", k: "Page", s: "What the site keeps on your device, the microphone, and the terms", u: "/privacy/", w: "privacy policy terms conditions cookies data microphone disclaimer credits licence" },
);

/* ---------- The lists: /scales/, /arpeggios/ ---------- */

// Both are built from src/templates/key-list.html: groups of cards, one card per key. The whole card links
// to `href`; `notes` (the notes of the scale or arpeggio, going up) are lit on a small keyboard at the side of the
// card; `links` (optional) are small buttons on the card for the key's other pages, and `textLinks` (optional) a
// single line of plain links under the subtitle, which keeps the card small.
const listTemplate = readPage(path.join(SRC, "templates", "key-list.html"));

const card = ({ notes, href, title, sub, links = [], textLinks = [] }) => `                <li class="key-card">
                    ${diagrams.miniKeyboard({ from: notes[0].abs, lit: notes.map((n) => n.abs) })}
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

function addList({ url, nav, title, description, heading, intro, chart, groups }) {
  addPage(url, `${url.slice(1)}index.html`, { ...listTemplate, meta: { ...listTemplate.meta, nav, title, description } }, {
    heading: esc(heading),
    intro: esc(intro),
    chartLink: chart ? `
            <p class="hero-more"><a class="go-link" href="${url}fingering-chart/">${chart}</a></p>` : "",
    groups: groups.filter(Boolean).join("\n"),
  });
}

const chromaticCard = card({
  notes: chromaticOctaves(0, false)[1].notes,
  href: "/keys/chromatic/",
  title: "Chromatic scale",
  sub: "Every black and white key, starting on any note",
});

// /scales/: each card opens the scale; a minor key also links to its three forms
addList({
  url: "/scales/",
  nav: "scales",
  title: "Piano Scales: Fingering for Every Major and Minor Scale | PianoGuide",
  description: "Every major and minor piano scale (natural, harmonic and melodic) with fingering for both hands, sheet music and keyboard diagrams.",
  heading: "Scales",
  intro: "Choose a scale to see its fingering for both hands, one or two octaves, with the sheet music and the keys on a keyboard.",
  chart: "Every scale's fingering on one page",
  groups: [
    keyGroup("Major scales", majorKeys, (key) => card({ notes: scaleData(key).notes, href: keyPageUrl(key), title: `${cap(key.name)} scale`, sub: cap(key.signature) })),
    keyGroup("Minor scales", minorKeys, (key) => card({
      notes: scaleData(key).notes,
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
    notes: arpeggioData(key).notes,
    href: keyPageUrl(key, ARPEGGIO_PAGE.path),
    title: `${cap(key.name)} arpeggio`,
    sub: cap(key.signature),
  });
  addList({
    url: "/arpeggios/",
    nav: "arpeggios",
    title: "Piano Arpeggios: Fingering for Every Major and Minor Key | PianoGuide",
    description: "Every major and minor piano arpeggio with fingering for both hands, one or two octaves, with sheet music and keyboard diagrams.",
    heading: "Arpeggios",
    intro: "Choose an arpeggio to see its fingering for both hands, one or two octaves, with the sheet music and the keys on a keyboard.",
    chart: "Every arpeggio's fingering on one page",
    groups: [
      keyGroup("Major arpeggios", majorKeys, arpCard),
      keyGroup("Minor arpeggios", minorKeys, arpCard),
    ],
  });
}

/* ---------- The fingering charts: /scales/fingering-chart/, /arpeggios/fingering-chart/ ---------- */

// Every key's fingering in one table, going up, in learning order: quick to look up, and easy to print and keep on
// the piano. Each row links to the key's own page. Both the one-octave and the two-octave fingering are in the page
// (the same numbers as on the key pages); the 1 octave / 2 octaves switch (public/js/chart.js) shows one of them.
const chartTemplate = readPage(path.join(SRC, "templates", "fingering-chart.html"));

// finger numbers with the thumb picked out, as on the key pages. `octave` (two octaves only): how many numbers one
// octave has. A faint line goes just before the middle note (the second C in C major), where the second octave
// starts, in the same place for both hands.
const chartFingers = (fingers, octave) => fingers.map((f, i) =>
  (i === octave - 1 ? '<span class="oct-split" aria-hidden="true"></span>' : "")
  + `<span class="f${f === 1 ? " thumb" : ""}">${f}</span>`).join("");

// one hand's line in the Fingering cell, with both octave choices: "RH 1 2 3 1 2 3 4 5"
const chartHand = (label, title, one, two) => `<span class="hand"><abbr title="${title}">${label}</abbr>`
  + `<span class="oct-1">${chartFingers(one)}</span><span class="oct-2">${chartFingers(two, one.length)}</span></span>`;

// rows: [{ name, url, notes, octaves, more }]: `octaves` is withTwoOctaves() output, `more` an optional line of
// small links under the name
const chartTable = (title, column, rows) => `            <div class="chart-group" id="${title.toLowerCase().replace(/ /g, "-")}">
                <h2 class="key-group-title">${title}</h2>
                <div class="table-scroll">
                    <table class="chart-table">
                        <thead>
                            <tr><th scope="col">${column}</th><th scope="col">Fingering</th></tr>
                        </thead>
                        <tbody>
${rows.map((r) => `                            <tr>
                                <th scope="row"><a href="${r.url}">${esc(r.name)}</a><span class="chart-notes">${esc(list(r.notes))}</span>${r.more || ""}</th>
                                <td>${chartHand("RH", "Right hand", r.octaves[1].rh, r.octaves[2].rh)}${chartHand("LH", "Left hand", r.octaves[1].lh, r.octaves[2].lh)}</td>
                            </tr>`).join("\n")}
                        </tbody>
                    </table>
                </div>
            </div>`;

function addChart({ section, title, description, heading, intro, tables }) {
  const [, sectionUrl, sectionName] = NAV.find(([id]) => id === section);
  const url = `${sectionUrl}fingering-chart/`;
  addPage(url, `${url.slice(1)}index.html`, { ...chartTemplate, meta: { ...chartTemplate.meta, nav: section, title, description } }, {
    sectionUrl,
    sectionName,
    url,
    heading: esc(heading),
    intro: esc(intro),
    tables: tables.join("\n"),
  });
}

// one and two octaves, exactly as the key pages work them out
const scaleOctaves = (key, form) => withTwoOctaves(scaleData(key, form), key.twoOctave && key.twoOctave.scale);
const arpeggioOctaves = (key) => withTwoOctaves(arpeggioData(key), key.twoOctave && key.twoOctave.arpeggio);

// A minor key gets one row when its three forms share a fingering (the usual case), with links to each form;
// otherwise one row per fingering, named after the forms that use it.
const MINOR_FORMS = ["natural", "harmonic", "melodic"];
function minorScaleRows(key) {
  const root = key.name.split(" ")[0];
  const groups = new Map(); // fingering -> forms
  for (const form of MINOR_FORMS) {
    const octaves = scaleOctaves(key, form);
    const id = JSON.stringify([octaves[1].rh, octaves[1].lh, octaves[2].rh, octaves[2].lh]);
    if (!groups.has(id)) groups.set(id, { octaves, forms: [] });
    groups.get(id).forms.push(form);
  }
  return [...groups.values()].map(({ octaves, forms }) => ({
    name: forms.length === 3 ? cap(key.name) : `${root} ${forms.join(" / ")} minor`,
    url: keyPageUrl(key, SCALE_FORMS[forms[0]].path),
    notes: octaves[1].notes.map((n) => n.name),
    octaves,
    more: forms.length === 3 ? `<span class="chart-more">${MINOR_FORMS.map((f) =>
      `<a href="${keyPageUrl(key, SCALE_FORMS[f].path)}">${SCALE_FORMS[f].tab}</a>`).join('<span aria-hidden="true"> · </span>')}</span>` : "",
  }));
}

{
  const sameForms = minorKeys.every((key) => minorScaleRows(key).length === 1);
  addChart({
    section: "scales",
    title: "Piano Scale Fingering Chart: Every Major and Minor Scale | PianoGuide",
    description: "The fingering for every major and minor piano scale on one page, right and left hand, in the order they are learnt.",
    heading: "Scale fingering chart",
    intro: `Every scale on one page, going up: RH is the right hand, LH the left. Finger 1 is the thumb.${sameForms ? " Minor scales use the same fingering in their natural, harmonic and melodic forms." : ""}`,
    tables: [
      chartTable("Major scales", "Scale", majorKeys.map((key) => {
        const octaves = scaleOctaves(key);
        return { name: cap(key.name), url: keyPageUrl(key), notes: octaves[1].notes.map((n) => n.name), octaves };
      })),
      chartTable("Minor scales", "Scale", minorKeys.flatMap(minorScaleRows)),
      `            <p class="chart-foot">The <a class="text-link" href="/keys/chromatic/">chromatic scale</a> has its own pattern: thumb on the white keys, finger 3 on the black keys.</p>`,
    ],
  });
}

{
  const arpRow = (key) => {
    const octaves = arpeggioOctaves(key);
    return { name: cap(key.name), url: keyPageUrl(key, ARPEGGIO_PAGE.path), notes: octaves[1].notes.map((n) => n.name), octaves };
  };
  addChart({
    section: "arpeggios",
    title: "Piano Arpeggio Fingering Chart: Every Major and Minor Arpeggio | PianoGuide",
    description: "The fingering for every major and minor piano arpeggio on one page, right and left hand, in the order they are learnt.",
    heading: "Arpeggio fingering chart",
    intro: "Every arpeggio on one page, going up: RH is the right hand, LH the left. Finger 1 is the thumb.",
    tables: [
      chartTable("Major arpeggios", "Arpeggio", majorKeys.map(arpRow)),
      chartTable("Minor arpeggios", "Arpeggio", minorKeys.map(arpRow)),
    ],
  });
}

/* ---------- The theory pages: intervals and the circle of fifths ---------- */

// Every interval within an octave, measured up from C: [semitones, name, short name, the upper note, a note]
const INTERVALS = [
  [1, "Minor 2nd", "m2", "D♭", "a semitone, or half step"],
  [2, "Major 2nd", "M2", "D", "a tone, or whole step"],
  [3, "Minor 3rd", "m3", "E♭", ""],
  [4, "Major 3rd", "M3", "E", ""],
  [5, "Perfect 4th", "P4", "F", ""],
  [6, "Augmented 4th / diminished 5th", "A4 / d5", "F♯", "also written C to G♭; called the tritone"],
  [7, "Perfect 5th", "P5", "G", ""],
  [8, "Minor 6th", "m6", "A♭", ""],
  [9, "Major 6th", "M6", "A", ""],
  [10, "Minor 7th", "m7", "B♭", ""],
  [11, "Major 7th", "M7", "B", ""],
  [12, "Octave", "P8", "C", "the same note, eight letters higher"],
];

// Each card: the name, its short name, and the two notes on the keyboard (C4 to D5) in the piano's ebony case, with
// a button that plays them one after the other and then together (public/js/intervals.js).
const intervalCards = INTERVALS.map(([semis, name, short, upper, note]) => {
  const marks = [{ abs: 0, name: "C" }, { abs: semis, name: upper }];
  return `                <li class="interval-card">
                    <div class="interval-head">
                        <h3>${esc(name)}</h3>
                        <span class="interval-short">${esc(short)}</span>
                    </div>
                    <p class="interval-meta">${semis} semitone${semis === 1 ? "" : "s"} · C to ${esc(upper)}${note ? ` · ${esc(note)}` : ""}</p>
                    <div class="piano-case interval-keys">
                        ${pianoKeysHTML({ from: 0, to: 14, marks, label: `${name}: C and ${upper} on the keyboard` })}
                        <button type="button" class="case-btn interval-hear" data-notes="0 ${semis}">▶ Hear it</button>
                    </div>
                </li>`;
}).join("\n");

// The circle: position 0 is C major at the top, and each step clockwise is a 5th higher. A key's place comes from its
// root: 7 semitones (a 5th) per step, so the step is (root × 7) mod 12. A minor key sits with its relative major, 3
// semitones above it.
const circlePlace = (key) => ((rootFor(key).semi + (isMinor(key) ? 3 : 0)) * 7) % 12;
const signatureCount = (key) => {
  const notes = signatureNotes(key).filter((n) => n.d !== 0);
  return notes.length === 0 ? "none" : `${notes.length}${notes[0].d > 0 ? "♯" : "♭"}`;
};
// (majorKeys and minorKeys are in learning order, so at the bottom the sharp key comes before the flat one)
const circleSlots = Array.from({ length: 12 }, (_, i) => {
  const here = (keys) => keys.filter((k) => circlePlace(k) === i).map((key) => ({
    name: cap(key.name),
    label: isMinor(key) ? `${key.name.split(" ")[0]}m` : key.name.split(" ")[0],
    url: keyPageUrl(key),
    sig: isMinor(key) ? "" : signatureCount(key),
  }));
  return { majors: here(majorKeys), minors: here(minorKeys) };
});

// The key signatures in a table, for reading (and for screen readers): each major key with its relative minor
const signatureRows = majorKeys.map((key) => {
  const rel = relativeOf(key);
  const link = (k) => k ? `<a class="text-link" href="${keyPageUrl(k)}">${esc(cap(k.name))}</a>` : "–";
  return `                    <tr><td>${esc(cap(key.signature))}</td><td>${link(key)}</td><td>${link(rel)}</td></tr>`;
}).join("\n");

/* ---------- The interactive keyboard ---------- */

// For the keyboard's "Show" option: every key's scale (each form for a minor key), arpeggio and chord, with the
// fingering for both hands and a link to the page. Notes are { name, abs }: abs is the semitone, 0 = middle C, and
// each starts on the root in the octave above middle C, which is where the keyboard shows them.
const keyboardShape = (d) => ({ notes: d.notes.map((n) => ({ name: n.name, abs: n.abs })), rh: d.rh, lh: d.lh });
const keyboardData = safeJSON([...majorKeys, ...minorKeys].map((key) => {
  const forms = isMinor(key) ? ["natural", "harmonic", "melodic"] : ["major"];
  const chord = chordData(key)[0]; // root position
  return {
    slug: key.slug,
    name: cap(key.name),
    minor: isMinor(key),
    scale: Object.fromEntries(forms.map((form) => [form, {
      ...keyboardShape(scaleData(key, form === "major" ? "natural" : form)),
      url: keyPageUrl(key, SCALE_FORMS[form].path),
    }])),
    arpeggio: { ...keyboardShape(arpeggioData(key)), url: keyPageUrl(key, ARPEGGIO_PAGE.path) },
    chord: {
      notes: chord.rh.notes.map((n) => ({ name: n.name, abs: n.abs })),
      rh: chord.rh.fingers,
      lh: chord.lh.fingers,
      url: keyPageUrl(key, CHORD_PAGE.path),
    },
  };
}));

/* ---------- The hand-written pages ---------- */

// The homepage's "Pick a key": a round badge for each key, in learning order, opening the key's page
const keyBadges = (keys) => keys.map((key) =>
  `                    <li><a class="key-badge${isMinor(key) ? " is-minor" : ""}" href="${keyPageUrl(key)}" aria-label="${esc(cap(key.name))}">${esc(key.name.split(" ")[0])}</a></li>`).join("\n");

// What the hand-written pages can use as {{...}}:
//   keyLinks     for the chords page: the key page of each major and minor triad, as JSON
//                { "<CHORD_ROOTS index>:<major|minor>": { url, name } }
//   majorBadges, minorBadges   for the homepage: the "Pick a key" rows
//   intervalCards              for /theory/intervals/: a card with a keyboard for each interval
//   circleOfFifths, signatureRows   for /theory/circle-of-fifths/: the circle, and the key signatures as table rows
//   keyboardData               for /keyboard/ and /practice/: every key's scale, arpeggio and chord, as JSON
const siteVars = {
  keyLinks: safeJSON(Object.fromEntries(KEYS.map((key) => [
    `${key.rootIndex}:${key.type === "minor" ? "minor" : "major"}`,
    { url: `/keys/${key.slug}/chord/`, name: cap(key.name) },
  ]))),
  majorBadges: keyBadges(majorKeys),
  minorBadges: keyBadges(minorKeys),
  intervalCards,
  circleOfFifths: diagrams.circleOfFifths(circleSlots),
  signatureRows,
  keyboardData,
};

// The hand-written pages: src/pages/chords/index.html -> /chords/, src/pages/404.html -> /404.html
for (const rel of fs.readdirSync(path.join(SRC, "pages"), { recursive: true }).sort()) {
  if (!rel.endsWith(".html")) continue;
  const out = rel.split(path.sep).join("/");
  const url = "/" + out.replace(/(^|\/)index\.html$/, "$1");
  addPage(url, out, readPage(path.join(SRC, "pages", rel)), siteVars);
}

/* ---------- Writing the files ---------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(PUBLIC, DIST, { recursive: true, filter: (src) => path.basename(src) !== ".DS_Store" });

// the stylesheets' pictures (url(/assets/...)) need the folder too
if (BASE_PATH) {
  for (const name of fs.readdirSync(path.join(DIST, "css"))) {
    const file = path.join(DIST, "css", name);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/url\((["']?)\/(?!\/)/g, `url($1${BASE_PATH}/`));
  }
}

for (const page of pages) {
  const file = path.join(DIST, page.out);
  if (fs.existsSync(file)) throw new Error(`two pages write ${page.out}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page.html);
}

fs.writeFileSync(path.join(DIST, "search-index.json"), JSON.stringify(searchEntries.map((e) => ({ ...e, u: BASE_PATH + e.u, w: e.w.trim() || undefined }))));

const listed = HIDDEN_FROM_SEARCH ? [] : pages.filter((p) => p.sitemap).sort((a, b) => a.url.localeCompare(b.url));
if (!HIDDEN_FROM_SEARCH) {
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((p) => `  <url><loc>${SITE_URL}${p.url}</loc></url>`).join("\n")}
</urlset>
`);
}

/* ---------- Checking the links ---------- */

// Every href="/..." and src="/..." must lead to a file in /dist/ (a folder link needs its index.html). With BASE_PATH
// the links start with it, and the rest is looked up in /dist/.
const broken = [];
const ownLink = new RegExp(`(?:href|src)="${BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\/(?!\\/)[^"#?]*)`, "g");
for (const page of pages) {
  for (const [, link] of page.html.matchAll(ownLink)) {
    const file = path.join(DIST, decodeURI(link));
    const ok = link.endsWith("/") ? fs.existsSync(path.join(file, "index.html"))
      : fs.existsSync(file) && fs.statSync(file).isFile();
    if (!ok) broken.push(`  ${page.url} -> ${link}`);
  }
}

console.log(`Built ${pages.length} pages into dist/ (${HIDDEN_FROM_SEARCH ? "hidden from search engines, no sitemap.xml" : `${listed.length} in sitemap.xml`})`);
if (broken.length) {
  console.error(`\n${broken.length} broken link${broken.length > 1 ? "s" : ""}:\n${[...new Set(broken)].join("\n")}`);
  process.exitCode = 1;
}
