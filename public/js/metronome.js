// The metronome (/metronome/). Two kinds:
//  - Basic: one tempo, set by typing it, with − and + (held down they keep going), or by tapping it.
//  - Tempo changes: a list of sections, each a tempo and a time signature kept for so many bars (60 for 4 bars of 4/4,
//    then 65 for 4 bars of 6/8, ...). After the last section it stops, starts again, or keeps going at the last tempo.
// The tempo counts the time signature's beats, as tempo marks in music do: crotchets in 4/4, minims in 2/2, dotted
// crotchets in 6/8. The first beat of the bar clicks high (when accented); Subdivide adds softer clicks between the
// beats (the quavers of 4/4, the three quavers of each beat in 6/8). Before a plan of tempo changes, a count-in of a
// bar or two at the starting tempo can come first, so its first bar isn't spent getting ready. The clicks are made by Web Audio and scheduled a moment
// ahead on its clock (not by timers, which drift), and the lights follow what is heard. The settings are kept in this
// browser between visits.

const $ = (id) => document.getElementById(id);

/* ---------- Settings ---------- */

const LIMITS = { bpm: [20, 300], bars: [1, 999] };
const MAX_SECTIONS = 20;
// each time signature: its beats in a bar, the note a beat is, and the clicks a beat splits into when subdivided
// (two, or three in 6/8, 9/8 and 12/8, whose beats are dotted)
const TIMES = {
  "2/4": { beats: 2, beat: "crotchet", split: 2 }, "3/4": { beats: 3, beat: "crotchet", split: 2 },
  "4/4": { beats: 4, beat: "crotchet", split: 2 }, "5/4": { beats: 5, beat: "crotchet", split: 2 },
  "2/2": { beats: 2, beat: "minim", split: 2 }, "3/8": { beats: 3, beat: "quaver", split: 2 },
  "6/8": { beats: 2, beat: "dotted crotchet", split: 3 }, "9/8": { beats: 3, beat: "dotted crotchet", split: 3 },
  "12/8": { beats: 4, beat: "dotted crotchet", split: 3 },
};
const DEFAULTS = {
  mode: "basic", // basic | changes
  bpm: 60,
  time: "4/4",
  subdivide: "off",
  accent: "on",
  countIn: "1", // bars before a plan of tempo changes: 0 | 1 | 2
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
  if (["on", "off"].includes(saved.subdivide)) settings.subdivide = saved.subdivide;
  if (["on", "off"].includes(saved.accent)) settings.accent = saved.accent;
  if (["0", "1", "2"].includes(saved.countIn)) settings.countIn = saved.countIn;
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

// A short wooden click: high on an accented first beat, lower and softer for the subdivisions between the beats. The
// count-in clicks are lower still, so it can be told from the first bar.
const CLICKS = { first: [1760, 0.9], beat: [1175, 0.55], within: [880, 0.32] };
function click(time, kind, counting) {
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
// a bar in a time signature: its clicks (one a beat, or each beat split when subdivided) and which are beats
function barOf(s) {
  const t = TIMES[s.time];
  const per = settings.subdivide === "on" ? t.split : 1;
  return { bpm: s.bpm, beats: t.beats, per, clicks: t.beats * per, onBeat: (i) => i % per === 0 };
}
const kindAt = (i, bar) => (i === 0 && settings.accent === "on" ? "first" : bar.onBeat(i) ? "beat" : "within");

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
  pos = { beat: 0, bar: 0, section: 0, countIn: settings.mode === "changes" ? Number(settings.countIn) : 0 }; // Basic just starts
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
  if ((key === "time" || key === "subdivide") && pos) pos.beat = 0; // a new time signature starts a new bar
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
const tempoName = (bpm) => TEMPO_NAMES.find(([upTo]) => bpm < upTo)[1];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// one light for each click of a bar: the first ringed, the subdivisions smaller, a gap before each beat after them
function drawLights(s) {
  const key = `${s.time} ${settings.subdivide}`;
  if ($("beats").dataset.metre === key) return;
  $("beats").dataset.metre = key;
  const bar = barOf(s);
  $("beats").innerHTML = Array.from({ length: bar.clicks }, (_, i) => {
    const cls = i === 0 ? "is-first" : !bar.onBeat(i) ? "is-within" : bar.per > 1 ? "is-beat" : "";
    return `<span${cls ? ` class="${cls}"` : ""}></span>`;
  }).join("");
  $("beats").classList.toggle("is-compact", bar.clicks > 6);
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
  if (document.activeElement !== $("bpm")) $("bpm").value = bpm;
  $("bpm").setAttribute("aria-label", `Tempo, in ${TIMES[s.time].beat} beats per minute`);
  drawLights(s);

  let status = running() ? "Playing" : "Ready";
  let detail = tempoName(bpm);
  if (now && now.left) {
    status = "Count-in";
    detail = `Starts in ${now.left}`;
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
    detail = `${plural(settings.sections.length, "section")}, starting at ${bpm} BPM`;
  } else if (now) {
    detail = `${tempoName(bpm)} · bar ${now.bar + 1}`;
  }
  $("met-status").textContent = status;
  $("met-detail").textContent = detail;

  $("beats").querySelectorAll("span").forEach((dot, i) => dot.classList.toggle("is-on", !!now && now.beat === i));
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
  $("beats").classList.toggle("no-accent", settings.accent === "off");

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
