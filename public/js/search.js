// The site's search, on every page: suggestions under the search box in the header as you type, and on the search
// page (/search/?q=...) every match, updated as you type. Both look through /search-index.json, written by
// scripts/build.js (every key page, every chord in the chord explorer, and the other pages), fetched the first time
// it is needed.
//
// Notes are written in many ways, so the words are tidied before they are compared: "F sharp", "F#", "f♯" are all
// f#, "B flat", "Bb", "B♭" all bb, "seventh" is 7th, and a plural counts as the word ("chords" finds chord). Every word
// typed must match: a note name exactly (b doesn't find bb), any other word by its start (arp finds arpeggio). A key
// is found under either spelling: "C sharp major" finds D♭ major, which plays the same keys.

(() => {
  const headerForm = document.querySelector(".search-form");
  if (!headerForm) return;
  const headerInput = headerForm.querySelector("input");
  const searchPage = new URL(headerForm.getAttribute("action"), location.href); // /search/, with the site's folder
  const indexUrl = new URL("../search-index.json", searchPage);

  /* ---------- Finding ---------- */

  const words = (text) => text.toLowerCase()
    .replace(/♯/g, "#").replace(/♭/g, "b")
    .replace(/\b([a-g])[\s-]*sharp\b/g, "$1#").replace(/\b([a-g])[\s-]*flat\b/g, "$1b")
    .replace(/\bsevenths?\b/g, "7th")
    .replace(/[^a-z0-9#\s]/g, " ")
    .split(/\s+/).filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  const isNote = (w) => /^[a-g][#b]?$/.test(w);

  let index = null;
  let loading = null;
  function loadIndex() {
    if (!loading) {
      loading = fetch(indexUrl).then((r) => r.json()).then((entries) => {
        index = entries.map((e, order) => {
          const title = words(e.t);
          const alt = e.a ? words(e.a) : [];
          return { ...e, order, title: title.join(" "), alt: alt.join(" "), all: [...title, ...alt, ...words(`${e.k} ${e.w || ""}`)] };
        });
        return index;
      });
    }
    return loading;
  }

  // the best matches first: each word found whole counts more than one found by its start, a title (in either
  // spelling) that begins with (or holds) the words typed counts more still, and a scale comes before its arpeggio
  // and chord. A result found by its other spelling carries it, as `asTyped`, to show beside the title.
  const KIND_ORDER = { Scale: 0.3, Arpeggio: 0.2, Chord: 0.1 };
  function find(query, limit = Infinity) {
    const typed = words(query);
    if (!typed.length || !index) return [];
    const phrase = typed.join(" ");
    const scored = [];
    for (const e of index) {
      let score = 0;
      let ok = true;
      for (const w of typed) {
        if (e.all.includes(w)) score += 3;
        else if (!isNote(w) && e.all.some((a) => a.startsWith(w))) score += 1;
        else { ok = false; break; }
      }
      if (!ok) continue;
      const byAlt = e.alt && !typed.every((w) => e.title.split(" ").includes(w)) && typed.some((w) => e.alt.split(" ").includes(w));
      const titles = [e.title, e.alt].filter(Boolean);
      if (titles.some((t) => t.startsWith(phrase))) score += 4;
      else if (titles.some((t) => t.includes(phrase))) score += 2;
      scored.push({ e: byAlt ? { ...e, asTyped: e.a } : e, score: score + (KIND_ORDER[e.k] || 0) });
    }
    return scored.sort((a, b) => b.score - a.score || a.e.order - b.e.order).slice(0, limit).map((r) => r.e);
  }

  // a result as a link: its title and kind, and (on the search page) the line under it
  function resultLink(e, className, withLine) {
    const a = document.createElement("a");
    a.className = className;
    a.href = e.u;
    const title = document.createElement("strong");
    title.textContent = e.t;
    if (e.asTyped) {
      const also = document.createElement("span");
      also.className = "search-also";
      also.textContent = ` = ${e.asTyped.replace(/ (scale|arpeggio|chord)$/, "")}`;
      title.append(also);
    }
    const kind = document.createElement("span");
    kind.className = "search-kind";
    kind.textContent = e.k;
    a.append(title, kind);
    if (withLine) {
      const line = document.createElement("span");
      line.className = "search-line";
      line.textContent = e.s;
      a.append(line);
    }
    return a;
  }

  /* ---------- Suggestions under the search box in the header ---------- */

  const suggest = document.createElement("div");
  suggest.className = "search-suggest";
  suggest.id = "search-suggest";
  suggest.hidden = true;
  headerForm.append(suggest);
  headerInput.setAttribute("autocomplete", "off");
  headerInput.setAttribute("aria-controls", "search-suggest");

  // with nothing typed yet, what can be looked for
  const HINTS = ["F sharp minor", "Bb arpeggio", "G7", "metronome"];
  function showHints() {
    suggest.innerHTML = "";
    const p = document.createElement("p");
    p.className = "suggest-hints";
    p.append("Try ");
    HINTS.forEach((h, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = h;
      b.addEventListener("click", () => {
        headerInput.value = h;
        showSuggestions();
        headerInput.focus();
      });
      p.append(b, i < HINTS.length - 1 ? " " : "");
    });
    suggest.append(p);
    suggest.hidden = false;
  }

  function showSuggestions() {
    const q = headerInput.value.trim();
    suggest.innerHTML = "";
    if (!q) {
      showHints();
      return;
    }
    loadIndex().then(() => {
      if (headerInput.value.trim() !== q) return; // typed on meanwhile
      const found = find(q, 6);
      suggest.innerHTML = "";
      found.forEach((e) => suggest.append(resultLink(e, "suggest-item", false)));
      if (!found.length) {
        const none = document.createElement("p");
        none.className = "suggest-none";
        none.textContent = `Nothing found for “${q}”`;
        suggest.append(none);
      }
      const all = document.createElement("a");
      all.className = "suggest-all";
      all.href = `${searchPage.pathname}?q=${encodeURIComponent(q)}`;
      all.textContent = found.length ? "See all results" : "Search tips";
      suggest.append(all);
      suggest.hidden = false;
    });
  }

  const closeSuggestions = () => { suggest.hidden = true; };
  headerInput.addEventListener("focus", () => { loadIndex(); showSuggestions(); });
  headerInput.addEventListener("input", showSuggestions);

  // the arrow keys move through the suggestions, Escape closes them; Enter in the box opens the search page
  headerForm.addEventListener("keydown", (e) => {
    const items = [...suggest.querySelectorAll("a, button")];
    const at = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && !suggest.hidden && items.length) {
      e.preventDefault();
      items[Math.min(at + 1, items.length - 1)].focus();
    } else if (e.key === "ArrowUp" && at >= 0) {
      e.preventDefault();
      if (at === 0) headerInput.focus();
      else items[at - 1].focus();
    } else if (e.key === "Escape" && !suggest.hidden) {
      e.preventDefault(); // used up here: it doesn't also close the search panel (main.js) or empty the box
      closeSuggestions();
      headerInput.focus();
    }
  });
  // Pressing on a suggestion keeps the focus in the box. Safari doesn't give a clicked link the focus, so the box
  // would lose it on the press, the suggestions would close (below) and the click would land on nothing.
  suggest.addEventListener("mousedown", (e) => e.preventDefault());
  // closed once the keyboard or a click leaves the search box and its suggestions
  headerForm.addEventListener("focusout", () => setTimeout(() => {
    if (!headerForm.contains(document.activeElement)) closeSuggestions();
  }));
  document.addEventListener("click", (e) => { if (!headerForm.contains(e.target)) closeSuggestions(); });

  /* ---------- The search page ---------- */

  const results = document.getElementById("search-results");
  if (!results) return;
  const pageInput = document.getElementById("search-input");
  const status = document.getElementById("search-status");
  const LIMIT = 60;
  const EXAMPLES = ["F sharp minor", "B flat arpeggio", "G7", "seventh chords", "circle of fifths"];

  function showResults() {
    const q = pageInput.value.trim();
    history.replaceState(null, "", q ? `?q=${encodeURIComponent(q)}` : location.pathname);
    results.innerHTML = "";
    if (!q) {
      status.textContent = "";
      showExamples("Try one of these:");
      return;
    }
    loadIndex().then(() => {
      if (pageInput.value.trim() !== q) return;
      const all = find(q);
      results.innerHTML = "";
      if (!all.length) {
        status.textContent = `Nothing found for “${q}”. Write a key like “E flat major”, a chord like “Dm7”, or a page like “metronome”.`;
        showExamples("Or try:");
        return;
      }
      status.textContent = all.length > LIMIT
        ? `${all.length} results for “${q}”, the first ${LIMIT} shown. Add a word to narrow them down.`
        : `${all.length} result${all.length === 1 ? "" : "s"} for “${q}”`;
      for (const e of all.slice(0, LIMIT)) {
        const li = document.createElement("li");
        li.append(resultLink(e, "search-result", true));
        results.append(li);
      }
    });
  }

  function showExamples(label) {
    const box = document.getElementById("search-examples");
    box.hidden = false;
    box.querySelector("span").textContent = label;
    box.querySelector("ul").innerHTML = "";
    for (const ex of EXAMPLES) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = ex;
      b.addEventListener("click", () => {
        pageInput.value = ex;
        showResults();
        pageInput.focus();
      });
      li.append(b);
      box.querySelector("ul").append(li);
    }
  }

  pageInput.value = new URLSearchParams(location.search).get("q") || "";
  pageInput.addEventListener("input", () => {
    document.getElementById("search-examples").hidden = true;
    showResults();
  });
  pageInput.form.addEventListener("submit", (e) => {
    e.preventDefault(); // the results are already there
    const first = results.querySelector("a");
    if (first) first.focus();
  });
  showResults();
})();
