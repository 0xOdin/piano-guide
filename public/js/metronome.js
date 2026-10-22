// The metronome (/metronome/). Two kinds:
//  - Basic: one tempo, set by typing it, with − and + (held down they keep going), or by tapping it.
//  - Tempo changes: a list of sections, each a tempo kept for so many bars (60 BPM for 4 bars, then 65 for 4, ...).
//    After the last section it stops, starts again, or keeps going at the last tempo.
// Both have the beats in a bar and an accented first beat. The clicks are made by Web Audio and scheduled a moment
// ahead on its clock (not by timers, which drift), and the lights follow what is heard. The settings are kept in
// this browser between visits.

const $ = (id) => document.getElementById(id);

/* ---------- Settings ---------- */

const LIMITS = { bpm: [20, 300], beats: [1, 12], bars: [1, 999] };
const MAX_SECTIONS = 20;
const DEFAULTS = {
  mode: "basic", // basic | changes
  bpm: 60,
  beats: 4,
  accent: "on",
  sections: [{ bpm: 60, bars: 4 }, { bpm: 65, bars: 4 }, { bpm: 70, bars: 4 }],
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
  if (okNumber(saved.beats)) settings.beats = clamp(saved.beats, LIMITS.beats);
  if (["on", "off"].includes(saved.accent)) settings.accent = saved.accent;
  if (["stop", "repeat", "keep"].includes(saved.end)) settings.end = saved.end;
  if (Array.isArray(saved.sections)) {
    const sections = saved.sections.filter((s) => s && okNumber(s.bpm) && okNumber(s.bars)).slice(0, MAX_SECTIONS)
      .map((s) => ({ bpm: clamp(s.bpm, LIMITS.bpm), bars: clamp(s.bars, LIMITS.bars) }));
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

// A short wooden click: a high one on an accented first beat
function click(time, accented) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = accented ? 1760 : 1175;
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(accented ? 0.9 : 0.55, time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(env).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.07);
}

/* ---------- Keeping time ---------- */

// where the metronome is: the beat in the bar, the bar (in the section, for tempo changes) and the section. `past`:
// the plan has ended and it keeps going at the last tempo.
let pos = null;
let nextTime = 0; // when the next click sounds, on the audio clock
let timer = null;
let stopAt = null; // the plan has ended: the time to stop
let heard = []; // clicks scheduled but not yet heard, for the lights: { time, beat, bar, section, past, bpm }
let shown = null; // the click heard last
let wakeLock = null;

const running = () => timer !== null;
const bpmAt = (p) => (settings.mode === "basic" ? settings.bpm : settings.sections[Math.min(p.section, settings.sections.length - 1)].bpm);

// moves on one beat, into the next bar and the next section as they come
function advance() {
  pos.beat++;
  if (pos.beat < settings.beats) return;
  pos.beat = 0;
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
    click(nextTime, pos.beat === 0 && settings.accent === "on" && settings.beats > 1);
    const bpm = bpmAt(pos);
    heard.push({ time: nextTime, beat: pos.beat, bar: pos.bar, section: pos.section, past: !!pos.past, bpm });
    nextTime += 60 / bpm;
    advance();
    if (pos.done) stopAt = nextTime;
  }
}

async function start() {
  // on an iPhone, sound that plays like music, so the ring/silent switch doesn't mute the clicks (Safari 17 and later)
  if (navigator.audioSession) navigator.audioSession.type = "playback";
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  pos = { beat: 0, bar: 0, section: 0 };
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

// A number setting: "bpm", "beats", or a section's "bpm:2" / "bars:2"
function setValue(target, value) {
  const [what, i] = target.split(":");
  if (!okNumber(value)) return;
  if (i === undefined) settings[what] = clamp(value, LIMITS[what]);
  else settings.sections[Number(i)][what] = clamp(value, LIMITS[what]);
  if (what === "beats" && pos && pos.beat >= settings.beats) pos.beat = settings.beats - 1; // fewer beats, mid-bar
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
  const box = e.target.closest("input[data-target], #bpm, #beats-input");
  if (!box) return;
  const target = box.dataset.target || (box.id === "bpm" ? "bpm" : "beats");
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
  const box = e.target.closest("input[data-target], #bpm, #beats-input");
  if (!box) return;
  const target = box.dataset.target || (box.id === "bpm" ? "bpm" : "beats");
  setValue(target, box.value === "" ? valueOf(target) : Number(box.value));
  box.value = valueOf(target); // a number out of range is brought into it
});

// the option buttons
document.querySelector(".met-tool").addEventListener("click", (e) => {
  const b = e.target.closest(".seg button");
  if (!b) return;
  const key = b.closest(".seg").dataset.setting;
  if (settings[key] === b.dataset.v) return;
  if (key === "mode" && running()) stop(); // a different metronome starts from the beginning
  settings[key] = b.dataset.v;
  save();
  render();
});

$("add-section").addEventListener("click", () => {
  const last = settings.sections[settings.sections.length - 1];
  settings.sections.push({ bpm: clamp(last.bpm + 5, LIMITS.bpm), bars: last.bars });
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

// how long the plan lasts, at its tempos
function renderTotal() {
  const bars = settings.sections.reduce((sum, s) => sum + s.bars, 0);
  const seconds = Math.round(settings.sections.reduce((sum, s) => sum + (s.bars * settings.beats * 60) / s.bpm, 0));
  $("met-total").textContent = `${plural(bars, "bar")} in all, about ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// what changes with every beat: the tempo shown, the line under it, the beat lights and the section playing
function renderNow() {
  const changes = settings.mode === "changes";
  const now = running() && shown ? shown : null;
  const bpm = now ? now.bpm : changes ? settings.sections[0].bpm : settings.bpm;
  if (document.activeElement !== $("bpm")) $("bpm").value = bpm;

  let status = running() ? "Playing" : "Ready";
  let detail = tempoName(bpm);
  if (changes && now) {
    const n = settings.sections.length;
    const section = settings.sections[Math.min(now.section, n - 1)];
    if (now.past) {
      status = "After the last section";
      detail = `Bar ${now.bar + 1} at ${bpm} BPM`;
    } else {
      status = `Section ${now.section + 1} of ${n}`;
      const left = section.bars - now.bar;
      const next = now.section + 1 < n ? settings.sections[now.section + 1]
        : settings.end === "repeat" ? settings.sections[0] : null;
      const after = { stop: " · the last section", keep: " · then it keeps this tempo" }[settings.end] || "";
      detail = `Bar ${now.bar + 1} of ${section.bars}${next ? ` · ${next.bpm} BPM in ${plural(left, "bar")}` : after}`;
    }
  } else if (changes) {
    detail = `${plural(settings.sections.length, "section")}, starting at ${bpm} BPM`;
  } else if (now) {
    detail = `${tempoName(bpm)} · bar ${now.bar + 1}`;
  }
  $("met-status").textContent = status;
  $("met-detail").textContent = detail;

  $("beats").querySelectorAll("span").forEach((dot, i) => dot.classList.toggle("is-on", !!now && now.beat === i));
  $("sections").querySelectorAll(".met-section").forEach((row, i) =>
    row.classList.toggle("is-current", !!now && !now.past && now.section === i));
}

// a number with − and + beside it
const stepperHTML = (target, value, what, label) => `
            <div class="stepper" role="group" aria-label="${label}">
                <button type="button" data-target="${target}" data-step="-1" aria-label="Less">−</button>
                <input type="number" inputmode="numeric" min="${LIMITS[what][0]}" max="${LIMITS[what][1]}" step="1" value="${value}" data-target="${target}" aria-label="${label}">
                <button type="button" data-target="${target}" data-step="1" aria-label="More">+</button>
            </div>`;

function render() {
  const changes = settings.mode === "changes";
  document.querySelectorAll(".met-tool .seg").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(settings[seg.dataset.setting] === b.dataset.v))));

  // Basic: the tempo is set in the case; tempo changes: the case shows the section's tempo, set in the list below
  document.querySelector(".met-case").classList.toggle("is-plan", changes);
  $("bpm").readOnly = changes;
  $("bpm").tabIndex = changes ? -1 : 0;
  $("tap-btn").hidden = changes;
  $("plan").hidden = !changes;
  if (document.activeElement !== $("beats-input")) $("beats-input").value = settings.beats;

  const b = $("start-btn");
  b.classList.toggle("is-playing", running());
  b.querySelector("span").textContent = running() ? "Stop" : "Start";

  // one light for each beat of the bar
  if ($("beats").children.length !== settings.beats) {
    $("beats").innerHTML = Array.from({ length: settings.beats }, (_, i) => `<span${i === 0 ? ' class="is-first"' : ""}></span>`).join("");
  }
  $("beats").classList.toggle("no-accent", settings.accent === "off");

  // the sections: drawn again only when one is added or removed, otherwise their numbers are brought up to date
  // (redrawing would take the cursor or the keyboard away from a box or button in use)
  if ($("sections").children.length !== settings.sections.length) {
    const one = settings.sections.length === 1;
    $("sections").innerHTML = settings.sections.map((s, i) => `
          <li class="met-section">
            <span class="met-section-num" aria-hidden="true">${i + 1}</span>
            <div class="met-field">${stepperHTML(`bpm:${i}`, s.bpm, "bpm", `Section ${i + 1} tempo, in beats per minute`)}
              <span class="met-unit">BPM</span>
            </div>
            <div class="met-field">
              <span class="met-unit">for</span>${stepperHTML(`bars:${i}`, s.bars, "bars", `Section ${i + 1} length, in bars`)}
              <span class="met-unit">${s.bars === 1 ? "bar" : "bars"}</span>
            </div>
            <button type="button" class="met-remove" data-i="${i}" aria-label="Remove section ${i + 1}"${one ? " hidden" : ""}>×</button>
          </li>`).join("");
  } else {
    $("sections").querySelectorAll(".met-section").forEach((row, i) => {
      row.querySelectorAll("input").forEach((box) => {
        if (box !== document.activeElement) box.value = valueOf(box.dataset.target);
      });
      row.querySelectorAll(".met-unit")[2].textContent = settings.sections[i].bars === 1 ? "bar" : "bars";
    });
  }
  $("add-section").disabled = settings.sections.length >= MAX_SECTIONS;
  renderTotal();
  renderNow();
}

render();
