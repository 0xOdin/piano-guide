# PianoGuide

A clear and practical piano reference: scales, chords and arpeggios in every key, with fingering, sheet music and
keyboard diagrams.

Each key (C major, F♯ minor, ...) has its own pages for the scale, arpeggio and chord. `/scales/` and `/arpeggios/`
list them, each card opening the page itself, and each has a fingering chart with every key on one page. The chord
explorer at `/chords/` covers every chord type on every root, and links to the key pages for major and minor triads.

`/practice/` asks for a random scale, chord or chord of a key to play or write out, or something to name by eye or
ear. Answers can be played on the page's keys, on a MIDI keyboard, or on a real piano through the microphone, or
typed.

The piano you hear is a real Steinway: the recordings of the University of Iowa Electronic Music Studios
(theremin.music.uiowa.edu), which "may be downloaded and used for any projects, without restrictions".

The site is plain HTML, CSS and JavaScript, built by a small Node.js script with no packages to install.

## Commands

```bash
npm run dev     # build, serve at http://localhost:3000, rebuild and reload on every save
npm run build   # build the site into dist/
npm start       # serve the last build
```

Needs Node.js 20 or newer. Set `SITE_URL` when building for the live site, so canonical links and the sitemap point
at the right address: `SITE_URL=https://your-domain.com npm run build`. Then upload the contents of `dist/`. If the
site lives in a folder of its address, set `BASE_PATH` to that folder as well, and every link on the site starts with
it: `BASE_PATH=/piano-guide npm run build`. Without it the build is just as before.

### Publishing on GitHub Pages

Every push to `main` builds the site and publishes it at https://0xodin.github.io/piano-guide/
(`.github/workflows/pages.yml`, which sets both `SITE_URL` and `BASE_PATH` from the repository's Pages address, so a
new repository name needs no change here). On GitHub, the repository's Settings → Pages → Source must be "GitHub
Actions".

## How it is organised

```
src/
  layout.html        the <head>, header, menu and footer shared by every page
  pages/             hand-written pages: src/pages/chords/index.html becomes /chords/
  templates/         the key pages, the lists and the fingering charts, filled in from the data
  data/              the keys (keys-data.js) and the major scales (scales-data.js)
public/              copied as it is: css/, js/, assets/ (assets/piano/ holds the piano sounds)
scripts/
  build.js           builds everything into dist/ and checks every link
  serve.js           local server for dist/
  make-sounds.js     makes the piano sounds from the recordings (aiff.js reads them)
recordings/          the original piano recordings, about 300 MB (not in git)
dist/                the finished site (not in git)
```

### The piano sounds

`public/assets/piano/` has one short recording per key from C2 to C6 (`60.m4a` is middle C), about 1.4 MB in all,
made from the Iowa recordings in `recordings/` by `node scripts/make-sounds.js` (macOS, as it uses `afconvert`). To
make them again, download the medium-loudness files `Piano.mf.C2.aiff` to `Piano.mf.C6.aiff` from
theremin.music.uiowa.edu/MISpiano.html into `recordings/`, then run it.

### Adding a page

Create `src/pages/<name>/index.html` with the page's content (what goes inside `<main>`) and a few settings on top:

```html
---
title: Intervals | PianoGuide
description: The distance between two notes, on the keyboard and in sheet music.
nav: theory
styles: page
scripts: vexflow intervals
---
<section class="page-hero">
    <h1>Intervals</h1>
</section>
```

- `nav` marks the current menu item (`scales`, `arpeggios`, `chords` or `theory`)
- `styles` loads `/css/<name>.css` after `main.css` (`page` has the hero, tabs and cards the inner pages share)
- `scripts` loads `/js/<name>.js` after `main.js` (`vexflow` is the sheet music library from its CDN)
- `sitemap: no` leaves the page out of `sitemap.xml`

The menu items are listed once, in `NAV` at the top of `scripts/build.js`.

### Adding a key

Add an entry to `src/data/keys-data.js` (the comment at the top of the file explains every field). The build writes
its scale, arpeggio and chord pages, adds it to the lists, the fingering charts, the circle of fifths and the sitemap, and stops with a message if an
index in the entry points at the wrong scale or chord.

### Broken links

The build fails if any `href="/..."` or `src="/..."` leads nowhere, and lists them. Pages that are planned but not
written yet (Theory, Intervals, Circle of Fifths) are shown on the homepage with a "Soon" label instead of a link.
