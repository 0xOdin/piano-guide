// The metronome (/metronome/). Two kinds:
//  - Basic: one tempo, set by typing it, with − and + (held down they keep going), or by tapping it.
//  - Tempo changes: a list of sections, each a tempo and a time signature kept for so many bars (60 for 4 bars of 4/4,
//    then 65 for 4 bars of 6/8, ...). After the last section it stops, starts again, or keeps going at the last tempo.
// As in most metronome apps (Soundbrenner's among them), the tempo counts the note in the time signature's bottom
// number: crotchets in 4/4, minims in 2/2, quavers in 6/8, so 6/8 clicks six times a bar. Each beat has an accent,
// set by tapping its light: strong, medium, soft or silent; the first beat starts strong, and in 6/8, 9/8 and 12/8
// each group of three starts medium. Subdivide splits every beat into 2, 3 or 4 softer clicks. A plan of tempo changes
// always starts with a bar's count-in at the first section's tempo, counted down on the case, so the first bar of the
// plan isn't spent getting ready. The clicks are made by Web Audio and scheduled a moment ahead on its clock (not by
// timers, which drift), and the lights follow what is heard. The settings are kept in this browser between visits.

const $ = (id) => document.getElementById(id);

/* ---------- Settings ---------- */

const LIMITS = { bpm: [20, 300], bars: [1, 999] };
const MAX_SECTIONS = 20;
// each time signature: its beats in a bar (the top number), the note a beat is (the bottom number), and whether its
// beats fall in groups of three (6/8, 9/8, 12/8)
const TIMES = {
  "2/4": { beats: 2, beat: "crotchet" }, "3/4": { beats: 3, beat: "crotchet" }, "4/4": { beats: 4, beat: "crotchet" },
  "5/4": { beats: 5, beat: "crotchet" }, "2/2": { beats: 2, beat: "minim" }, "3/8": { beats: 3, beat: "quaver" },
  "6/8": { beats: 6, beat: "quaver", threes: true }, "9/8": { beats: 9, beat: "quaver", threes: true },
  "12/8": { beats: 12, beat: "quaver", threes: true },
};
// accents: 3 strong, 2 medium, 1 soft, 0 silent
const ACCENT_NAMES = ["silent", "soft", "medium", "strong"];
const defaultAccents = (time, first = 3) => Array.from({ length: TIMES[time].beats }, (_, i) =>
  (i === 0 ? first : TIMES[time].threes && i % 3 === 0 ? 2 : 1));
const DEFAULTS = {
  mode: "basic", // basic | changes
  bpm: 60,
  time: "4/4",
  subdivide: "1", // clicks to a beat: 1 (off) | 2 | 3 | 4
  accents: {}, // time signature -> the accent of each beat, once changed from the defaults
  sections: [{ bpm: 60, bars: 4, time: "4/4" }, { bpm: 65, bars: 4, time: "4/4" }, { bpm: 70, bars: 4, time: "4/4" }],
  end: "stop", // stop | repeat | keep
};
const STORE = "pianoguide-metronome";

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Math.round(v)));
const okNumber = (v) => typeof v === "number" && Number.isFinite(v);

const settings = structuredClone(DEFAULTS);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  if (["basic", "changes"].includes(saved.mode)) settings.mode = saved.mode;
  if (okNumber(saved.bpm)) settings.bpm = clamp(saved.bpm, LIMITS.bpm);
  if (saved.time in TIMES) settings.time = saved.time;
  else if (okNumber(saved.beats)) settings.time = `${[2, 3, 4, 5].includes(saved.beats) ? saved.beats : 4}/4`; // saved before time signatures
  if (["1", "2", "3", "4"].includes(saved.subdivide)) settings.subdivide = saved.subdivide;
  else if (saved.subdivide === "on") settings.subdivide = "2"; // saved when Subdivide was on or off
  if (saved.accents && typeof saved.accents === "object") {
    for (const [time, levels] of Object.entries(saved.accents)) {
      if (time in TIMES && Array.isArray(levels) && levels.length === TIMES[time].beats && levels.every((l) => [0, 1, 2, 3].includes(l))) {
        settings.accents[time] = levels;
      }
    }
  } else if (saved.accent === "off") {
    // saved when the first beat was accented or "like the others": every time signature's first beat soft
    for (const time of Object.keys(TIMES)) settings.accents[time] = defaultAccents(time, 1);
  }
  if (["stop", "repeat", "keep"].includes(saved.end)) settings.end = saved.end;
  if (Array.isArray(saved.sections)) {
    // sections saved before they had their own time signature take Basic's
    const sections = saved.sections.filter((s) => s && okNumber(s.bpm) && okNumber(s.bars)).slice(0, MAX_SECTIONS)
      .map((s) => ({
        bpm: clamp(s.bpm, LIMITS.bpm),
        bars: clamp(s.bars, LIMITS.bars),
        time: s.time in TIMES ? s.time : settings.time,
      }));
    if (sections.length) settings.sections = sections;
  }
} catch (e) {
  // no storage here (a private window): the defaults
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
  } catch (e) {
    // not kept, which is fine
  }
}

/* ---------- The sound ---------- */

let ctx = null;

// A short wooden click: higher and louder the stronger its beat's accent, none for a silent beat, lowest and softest
// for the subdivisions between the beats. The count-in clicks are lower still, so it can be told from the first bar.
const CLICKS = { 3: [1760, 0.9], 2: [1400, 0.7], 1: [1175, 0.5], within: [880, 0.3] };
function click(time, kind, counting) {
  if (kind === 0) return;
  const [pitch, level] = CLICKS[kind];
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = counting ? pitch * 0.7 : pitch;
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(level, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(env).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.07);
}

/* ---------- Keeping time ---------- */

// where the metronome is: the click in the bar, the bar (in the section, for tempo changes) and the section.
// `countIn`: bars of count-in still to come; `past`: the plan has ended and it keeps going at the last tempo.
let pos = null;
let nextTime = 0; // when the next click sounds, on the audio clock
let timer = null;
let stopAt = null; // the plan has ended: the time to stop
let heard = []; // clicks scheduled but not yet heard, for the lights: { time, beat, bar, section, past, bpm, left }
let shown = null; // the click heard last
let wakeLock = null;

const running = () => timer !== null;
// what sets the tempo and the time signature at a place: Basic's own settings, or its section
const sourceAt = (p) => (settings.mode === "basic" ? settings : settings.sections[Math.min(p.section, settings.sections.length - 1)]);
// a time signature's accents: as set, or the defaults
const accentsOf = (time) => settings.accents[time] || defaultAccents(time);
// a bar in a time signature: its clicks (one a beat, or each beat split when subdivided)
function barOf(s) {
  const per = Number(settings.subdivide);
  return { bpm: s.bpm, time: s.time, beats: TIMES[s.time].beats, per, clicks: TIMES[s.time].beats * per };
}
// a click's kind: its beat's accent, or a subdivision
const kindAt = (i, bar) => (i % bar.per ? "within" : accentsOf(bar.time)[i / bar.per]);

// moves on one click, into the next bar and the next section as they come
function advance() {
  pos.beat++;
  if (pos.beat < barOf(sourceAt(pos)).clicks) return;
  pos.beat = 0;
  if (pos.countIn > 0) {
    pos.countIn--;
    return;
  }
  pos.bar++;
  if (settings.mode === "basic" || pos.past || pos.bar < settings.sections[pos.section].bars) return;
  pos.bar = 0;
  pos.section++;
  if (pos.section < settings.sections.length) return;
  if (settings.end === "repeat") {
    pos.section = 0;
  } else if (settings.end === "keep") {
    pos.section = settings.sections.length - 1;
    pos.past = true;
    pos.bar = settings.sections[pos.section].bars; // the bars carry on counting
  } else {
    pos.done = true;
  }
}

// Schedules every click due in the next moment. A hidden page's timers run only once a second, so it looks further
// ahead then, to keep the beat going.
function schedule() {
  const ahead = document.hidden ? 1.5 : 0.12;
  while (!pos.done && nextTime < ctx.currentTime + ahead) {
    const bar = barOf(sourceAt(pos));
    const counting = pos.countIn > 0;
    click(nextTime, kindAt(pos.beat, bar), counting);
    // `left`: in the count-in, the beats to go before the first bar, this one included
    const left = counting ? (pos.countIn - 1) * bar.beats + bar.beats - Math.floor(pos.beat / bar.per) : 0;
    heard.push({ time: nextTime, beat: pos.beat, bar: pos.bar, section: pos.section, past: !!pos.past, bpm: bar.bpm, left });
    nextTime += 60 / bar.bpm / bar.per;
    advance();
    if (pos.done) stopAt = nextTime;
  }
}

async function start() {
  // on an iPhone, sound that plays like music, so the ring/silent switch doesn't mute the clicks (Safari 17 and later)
  if (navigator.audioSession) navigator.audioSession.type = "playback";
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  pos = { beat: 0, bar: 0, section: 0, countIn: settings.mode === "changes" ? 1 : 0 }; // Basic just starts
  heard = [];
  shown = null;
  stopAt = null;
  nextTime = ctx.currentTime + 0.08;
  timer = setInterval(schedule, 25);
  schedule();
  keepAwake();
  render();
  requestAnimationFrame(follow);
}

function stop() {
  clearInterval(timer);
  timer = null;
  pos = null;
  heard = [];
  shown = null;
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
  render();
}

// the screen stays on while the metronome runs, where the browser allows it
async function keepAwake() {
  try {
    if ("wakeLock" in navigator && !document.hidden) wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) {
    // not allowed here: the screen may dim as usual
  }
}
document.addEventListener("visibilitychange", () => {
  if (running() && !document.hidden && !wakeLock) keepAwake();
  if (document.hidden && wakeLock) wakeLock = null; // the browser lets it go; asked for again on return
});

// Each frame: light what is being heard now, and stop once a plan that ends has played its last beat
function follow() {
  if (!running()) return;
  const now = ctx.currentTime;
  if (stopAt !== null && now >= stopAt) {
    stop();
    return;
  }
  let changed = false;
  while (heard.length && heard[0].time <= now) {
    shown = heard.shift();
    changed = true;
  }
  if (changed) renderNow();
  requestAnimationFrame(follow);
}

/* ---------- Tap tempo ---------- */

let taps = [];
function tap() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = []; // a long pause starts a new count
  taps.push(now);
  taps = taps.slice(-6);
  if (taps.length < 2) {
    $("met-detail").textContent = "Keep tapping…";
    return;
  }
  const gaps = taps.slice(1).map((t, i) => t - taps[i]);
  setValue("bpm", 60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
}

/* ---------- Changing the settings ---------- */

// A number setting: "bpm", or a section's "bpm:2" / "bars:2"
function setValue(target, value) {
  const [what, i] = target.split(":");
  if (!okNumber(value)) return;
  if (i === undefined) settings[what] = clamp(value, LIMITS[what]);
  else settings.sections[Number(i)][what] = clamp(value, LIMITS[what]);
  save();
  render();
}

const valueOf = (target) => {
  const [what, i] = target.split(":");
  return i === undefined ? settings[what] : settings.sections[Number(i)][what];
};

// − and +: one step for a press; held down, they keep stepping, faster after a moment
let holdTimer = null;
let pointerStepped = false;
function stepper(button) {
  setValue(button.dataset.target, valueOf(button.dataset.target) + Number(button.dataset.step));
}
function endHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
}
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest("[data-step]");
  if (!b || e.button !== 0) return;
  pointerStepped = true;
  stepper(b);
  let wait = 420;
  const again = () => {
    stepper(b);
    wait = Math.max(40, wait * 0.8);
    holdTimer = setTimeout(again, wait);
  };
  holdTimer = setTimeout(again, wait);
});
// let go, slid off the button, or the window lost focus (focus moving inside the page doesn't count: pressing − or +
// can take it from a box)
["pointerup", "pointercancel", "pointerleave"].forEach((type) => document.addEventListener(type, endHold, true));
window.addEventListener("blur", endHold);
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-step]");
  if (!b) return;
  if (pointerStepped) {
    pointerStepped = false; // already stepped on pointerdown
    return;
  }
  stepper(b); // Enter or Space on a focused button
});

// typed numbers: used as soon as they make sense, tidied when the box is left
document.addEventListener("input", (e) => {
  const box = e.target.closest("input[data-target], #bpm");
  if (!box) return;
  const target = box.dataset.target || "bpm";
  const [what] = target.split(":");
  const v = Number(box.value);
  if (box.value !== "" && v >= LIMITS[what][0] && v <= LIMITS[what][1]) {
    const [, i] = target.split(":");
    if (i === undefined) settings[what] = Math.round(v);
    else settings.sections[Number(i)][what] = Math.round(v);
    save();
    renderNow();
    renderTotal();
  }
});
document.addEventListener("change", (e) => {
  const box = e.target.closest("input[data-target], #bpm");
  if (!box) return;
  const target = box.dataset.target || "bpm";
  setValue(target, box.value === "" ? valueOf(target) : Number(box.value));
  box.value = valueOf(target); // a number out of range is brought into it
});

// a section's time signature, from its menu; changed in the section playing, it starts a new bar
$("sections").addEventListener("change", (e) => {
  const menu = e.target.closest("select[data-target]");
  if (!menu) return;
  const i = Number(menu.dataset.target.split(":")[1]);
  settings.sections[i].time = menu.value;
  if (pos && !pos.countIn && pos.section === i) pos.beat = 0;
  save();
  render();
});

// the option buttons
document.querySelector(".met-tool").addEventListener("click", (e) => {
  const b = e.target.closest(".seg button");
  if (!b || b.disabled) return;
  const key = b.closest(".seg").dataset.setting;
  if (settings[key] === b.dataset.v) return;
  if (key === "mode" && running()) stop(); // a different metronome starts from the beginning
  if ((key === "time" || key === "subdivide") && pos) pos.beat = 0; // a new time signature or subdivision starts a new bar
  settings[key] = b.dataset.v;
  save();
  render();
});

$("add-section").addEventListener("click", () => {
  const last = settings.sections[settings.sections.length - 1];
  settings.sections.push({ ...last, bpm: clamp(last.bpm + 5, LIMITS.bpm) });
  save();
  render();
  const boxes = $("sections").querySelectorAll("input");
  boxes[boxes.length - 2].focus();
});

$("sections").addEventListener("click", (e) => {
  const b = e.target.closest(".met-remove");
  if (!b) return;
  const i = Number(b.dataset.i);
  settings.sections.splice(i, 1);
  if (pos && pos.section >= settings.sections.length) pos.section = settings.sections.length - 1;
  else if (pos && pos.section > i) pos.section--;
  save();
  render();
});

// a tap on a beat's light changes its accent: strong, medium, soft, silent, then strong again. It is the accent of
// that beat in the time signature shown, wherever that time signature is used.
$("beats").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  const time = sourceAt(running() && shown ? shown : { section: 0 }).time;
  const levels = [...accentsOf(time)];
  const i = Number(b.dataset.i);
  levels[i] = (levels[i] + 3) % 4;
  settings.accents[time] = levels;
  save();
  renderNow();
});

$("start-btn").addEventListener("click", () => (running() ? stop() : start()));
$("tap-btn").addEventListener("click", tap);

// Space starts and stops, unless a box or button has the keyboard
document.addEventListener("keydown", (e) => {
  if (e.key !== " " || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest("input, select, textarea, button, a")) return;
  e.preventDefault();
  if (running()) stop();
  else start();
});

/* ---------- Drawing ---------- */

// the Italian name of a tempo, as written in music
const TEMPO_NAMES = [[40, "Grave"], [60, "Largo"], [66, "Larghetto"], [76, "Adagio"], [108, "Andante"], [120, "Moderato"],
  [168, "Allegro"], [200, "Presto"], [Infinity, "Prestissimo"]];
// for the beats felt: in 6/8, 9/8 and 12/8 one to each group of three quavers
const tempoName = (bpm, time) => TEMPO_NAMES.find(([upTo]) => (TIMES[time].threes ? bpm / 3 : bpm) < upTo)[1];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// one light for each beat of the bar, to tap: drawn by its accent (a felt ring for strong, brass for medium, a plain
// light for soft, an empty ring for silent), with a gap before each group of three in 6/8, 9/8 and 12/8
function drawLights(time) {
  const levels = accentsOf(time);
  const key = `${time} ${levels.join("")}`;
  if ($("beats").dataset.metre === key) return;
  $("beats").dataset.metre = key;
  $("beats").innerHTML = levels.map((level, i) => {
    const group = TIMES[time].threes && i > 0 && i % 3 === 0 ? " is-group" : "";
    return `<button type="button" class="met-beat lvl-${level}${group}" data-i="${i}" aria-label="Beat ${i + 1}: ${ACCENT_NAMES[level]}"></button>`;
  }).join("");
  $("beats").classList.toggle("is-compact", levels.length > 6);
  $("beats").classList.toggle("is-twelve", levels.length === 12);
}

// how long the plan lasts, at its tempos
function renderTotal() {
  const bars = settings.sections.reduce((sum, s) => sum + s.bars, 0);
  const seconds = Math.round(settings.sections.reduce((sum, s) => sum + (s.bars * TIMES[s.time].beats * 60) / s.bpm, 0));
  $("met-total").textContent = `${plural(bars, "bar")} in all, about ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// what changes with every beat: the tempo shown, the line under it, the beat lights and the section playing
function renderNow() {
  const changes = settings.mode === "changes";
  const now = running() && shown ? shown : null;
  const s = sourceAt(now || { section: 0 });
  const bpm = now ? now.bpm : s.bpm;
  // in the count-in, the big number counts down the beats to go, over "Count-in"
  const counting = !!now && !!now.left;
  document.querySelector(".met-case").classList.toggle("is-counting", counting);
  if (document.activeElement !== $("bpm")) $("bpm").value = counting ? now.left : bpm;
  $("bpm-label").textContent = counting ? "Count-in" : "BPM";
  $("bpm").setAttribute("aria-label", `Tempo, in ${TIMES[s.time].beat}s per minute`);
  drawLights(s.time);

  let status = running() ? "Playing" : "Ready";
  let detail = tempoName(bpm, s.time);
  if (counting) {
    status = "Get ready";
    detail = `Section 1 starts at ${bpm} BPM`;
  } else if (changes && now) {
    const n = settings.sections.length;
    if (now.past) {
      status = "After the last section";
      detail = `Bar ${now.bar + 1} at ${bpm} BPM`;
    } else {
      status = `Section ${now.section + 1} of ${n}`;
      const left = s.bars - now.bar;
      const next = now.section + 1 < n ? settings.sections[now.section + 1]
        : settings.end === "repeat" ? settings.sections[0] : null;
      const after = { stop: " · the last section", keep: " · then it keeps this tempo" }[settings.end] || "";
      const nextText = next && `${next.time !== s.time ? `${next.time} at ` : ""}${next.bpm} BPM`;
      detail = `Bar ${now.bar + 1} of ${s.bars}${next ? ` · ${nextText} in ${plural(left, "bar")}` : after}`;
    }
  } else if (changes) {
    detail = `A bar to count in, then ${plural(settings.sections.length, "section")} from ${bpm} BPM`;
  } else if (now) {
    detail = `${tempoName(bpm, s.time)} · bar ${now.bar + 1}`;
  }
  $("met-status").textContent = status;
  $("met-detail").textContent = detail;

  const beatNow = now ? Math.floor(now.beat / Number(settings.subdivide)) : -1;
  $("beats").querySelectorAll("button").forEach((dot, i) => dot.classList.toggle("is-on", beatNow === i));
  $("beats").classList.toggle("is-counting", !!now && !!now.left);
  $("sections").querySelectorAll(".met-section").forEach((row, i) =>
    row.classList.toggle("is-current", !!now && !now.left && !now.past && now.section === i));
}

// a number with − and + beside it
const stepperHTML = (target, value, what, label) => `
            <div class="stepper" role="group" aria-label="${label}">
                <button type="button" data-target="${target}" data-step="-1" aria-label="Less">−</button>
                <input type="number" inputmode="numeric" min="${LIMITS[what][0]}" max="${LIMITS[what][1]}" step="1" value="${value}" data-target="${target}" aria-label="${label}">
                <button type="button" data-target="${target}" data-step="1" aria-label="More">+</button>
            </div>`;
// a section's time signature menu
const timeOptions = (s) => Object.keys(TIMES).map((t) => `<option value="${t}"${t === s.time ? " selected" : ""}>${t}</option>`).join("");

function render() {
  const changes = settings.mode === "changes";
  document.querySelectorAll(".met-tool .seg").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(settings[seg.dataset.setting] === b.dataset.v))));
  const t = TIMES[settings.time];
  $("time-hint").textContent = `${t.beats} ${t.beat} beats in a bar: the tempo counts them.`;
  $("subdivide-hint").textContent = settings.subdivide === "1" ? ""
    : `Each beat split into ${settings.subdivide} clicks, the ones after the first softer.`;

  // Basic: the tempo and time signature are set here; tempo changes: in each section of the list below
  document.querySelector(".met-case").classList.toggle("is-plan", changes);
  $("bpm").readOnly = changes;
  $("bpm").tabIndex = changes ? -1 : 0;
  $("tap-btn").hidden = changes;
  $("metre").hidden = changes;
  $("plan").hidden = !changes;

  const b = $("start-btn");
  b.classList.toggle("is-playing", running());
  b.querySelector("span").textContent = running() ? "Stop" : "Start";

  // the sections: drawn again only when one is added or removed, otherwise their numbers and menus are brought up to
  // date (redrawing would take the cursor or the keyboard away from a box or button in use)
  if ($("sections").children.length !== settings.sections.length) {
    const one = settings.sections.length === 1;
    $("sections").innerHTML = settings.sections.map((s, i) => `
          <li class="met-section">
            <span class="met-section-num" aria-hidden="true">${i + 1}</span>
            <div class="met-field met-field-tempo">${stepperHTML(`bpm:${i}`, s.bpm, "bpm", `Section ${i + 1} tempo, in beats per minute`)}
              <span class="met-unit">BPM</span>
            </div>
            <div class="met-field met-field-bars">${stepperHTML(`bars:${i}`, s.bars, "bars", `Section ${i + 1} length, in bars`)}
              <span class="met-unit met-bars-word">${s.bars === 1 ? "bar" : "bars"} of</span>
              <select class="met-select" data-target="time:${i}" aria-label="Section ${i + 1} time signature">${timeOptions(s)}</select>
            </div>
            <button type="button" class="met-remove" data-i="${i}" aria-label="Remove section ${i + 1}"${one ? " hidden" : ""}>×</button>
          </li>`).join("");
  } else {
    $("sections").querySelectorAll(".met-section").forEach((row, i) => {
      const s = settings.sections[i];
      row.querySelectorAll("input").forEach((box) => {
        if (box !== document.activeElement) box.value = valueOf(box.dataset.target);
      });
      row.querySelector(".met-bars-word").textContent = `${s.bars === 1 ? "bar" : "bars"} of`;
      row.querySelector("select").value = s.time;
    });
  }
  $("add-section").disabled = settings.sections.length >= MAX_SECTIONS;
  renderTotal();
  renderNow();
}

render();
