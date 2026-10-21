// The homepage's keyboard: tap keys and they stay down, sound on the recorded piano (piano-sound.js), and are named
// above the keys (describeKeys, note-names.js): a note, an interval or a chord with its inversion. It opens with a C
// major chord down to show what it does; the first tap starts a chord of your own. Phones get one octave and a third
// (C4 to E5), wider screens two octaves (C4 to C6).

(() => {
  const piano = document.getElementById("hero-piano");
  if (!piano) return;
  const nameEl = document.getElementById("hero-name");
  const detailEl = document.getElementById("hero-detail");
  const hintEl = document.getElementById("hero-hint");

  const pc = (abs) => ((abs % 12) + 12) % 12;
  const isBlack = (abs) => ![0, 2, 4, 5, 7, 9, 11].includes(pc(abs));
  const withOctave = (abs) => `${CHORD_ROOTS[pc(abs)].name}${4 + Math.floor(abs / 12)}`;
  const wide = window.matchMedia("(min-width: 640px)");

  const down = new Set([0, 4, 7]); // C major, to begin with
  let example = true; // the opening chord is still down
  let high = 0;
  const keyEls = new Map();

  function draw() {
    high = wide.matches ? 24 : 16;
    for (const abs of down) if (abs > high) down.delete(abs);
    const whites = [...Array(high + 1).keys()].filter((abs) => !isBlack(abs)).length;
    const w = 100 / whites; // width of a white key, in %
    let html = "";
    let seen = 0;
    for (let abs = 0; abs <= high; abs++) {
      const black = isBlack(abs);
      // a black key sits on the line between two white keys
      const style = black ? ` style="left:${(seen * w - w * 0.31).toFixed(3)}%;width:${(w * 0.62).toFixed(3)}%"` : "";
      html += `<button type="button" class="pkey ${black ? "black" : "white"}" data-abs="${abs}" aria-label="${withOctave(abs)}" aria-pressed="false"${style}>`
        + `<span class="pkey-name"></span></button>`;
      if (!black) seen++;
    }
    piano.style.setProperty("--whites", whites);
    piano.innerHTML = html;
    keyEls.clear();
    piano.querySelectorAll(".pkey").forEach((el) => keyEls.set(Number(el.dataset.abs), el));
    render();
  }

  function render() {
    keyEls.forEach((el, abs) => {
      const on = down.has(abs);
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-pressed", String(on));
      el.querySelector(".pkey-name").textContent = on ? CHORD_ROOTS[pc(abs)].name : pc(abs) === 0 ? withOctave(abs) : "";
    });
    const text = down.size ? describeKeys([...down]) : { title: "Play something", detail: "Tap a few keys and they are named here." };
    nameEl.textContent = text.title;
    detailEl.textContent = text.detail;
    hintEl.textContent = example ? "Tap the keys to make your own chord." : "Tap a key again to let it go.";
  }

  function press(abs) {
    if (example) {
      down.clear();
      example = false;
    }
    if (down.has(abs)) {
      down.delete(abs);
    } else {
      down.add(abs);
      playPiano(abs, { length: 0.9 });
    }
    render();
  }

  // a key sounds as soon as it is pressed (pointerdown); `click` is for the keyboard (Enter or Space on a focused key)
  let pointerPressed = false;
  piano.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".pkey");
    if (!el || e.button !== 0) return;
    pointerPressed = true;
    press(Number(el.dataset.abs));
  });
  piano.addEventListener("click", (e) => {
    const el = e.target.closest(".pkey");
    if (!el) return;
    if (pointerPressed) {
      pointerPressed = false;
      return;
    }
    press(Number(el.dataset.abs));
  });
  document.addEventListener("pointerup", () => setTimeout(() => { pointerPressed = false; }));

  // Hear it: the keys down, together; the opening chord counts as yours from here
  document.getElementById("hero-hear").addEventListener("click", () => {
    if (!down.size) return;
    [...down].forEach((abs) => playPiano(abs, { length: 1.2 }));
    keyEls.forEach((el, abs) => {
      if (!down.has(abs)) return;
      el.classList.add("is-down");
      setTimeout(() => el.classList.remove("is-down"), 500);
    });
  });
  document.getElementById("hero-clear").addEventListener("click", () => {
    down.clear();
    example = false;
    render();
  });

  wide.addEventListener("change", draw);
  draw();
})();
