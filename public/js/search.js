// The site's search, on every page: suggestions under the search box in the header as you type, and on the search
// page (/search/?q=...) every match, updated as you type. Both look through /search-index.json, written by
// scripts/build.js (every key page, every chord in the chord explorer, and the other pages), fetched the first time
// it is needed.
//
// Notes are written in many ways, so the words are tidied before they are compared: "F sharp", "F#", "f♯" are all
// f#, "B flat", "Bb", "B♭" all bb, "seventh" is 7th, and a plural counts as the word ("chords" finds chord). Every word
// typed must match: a note name exactly (b doesn't find bb), any other word by its start (arp finds arpeggio).

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
          return { ...e, order, title: title.join(" "), all: [...title, ...words(`${e.k} ${e.w || ""}`)] };
        });
        return index;
      });
    }
    return loading;
  }

  // the best matches first: each word found whole counts more than one found by its start, a title that begins with
  // (or holds) the words typed counts more still, and a scale comes before its arpeggio and chord
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
      if (e.title.startsWith(phrase)) score += 4;
      else if (e.title.includes(phrase)) score += 2;
      scored.push({ e, score: score + (KIND_ORDER[e.k] || 0) });
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

  function showSuggestions() {
    const q = headerInput.value.trim();
    suggest.innerHTML = "";
    if (!q) {
      suggest.hidden = true;
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
  headerInput.addEventListener("focus", () => { loadIndex(); if (headerInput.value.trim()) showSuggestions(); });
  headerInput.addEventListener("input", showSuggestions);

  // the arrow keys move through the suggestions, Escape closes them; Enter in the box opens the search page
  headerForm.addEventListener("keydown", (e) => {
    const items = [...suggest.querySelectorAll("a")];
    const at = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && !suggest.hidden && items.length) {
      e.preventDefault();
      items[Math.min(at + 1, items.length - 1)].focus();
    } else if (e.key === "ArrowUp" && at >= 0) {
      e.preventDefault();
      if (at === 0) headerInput.focus();
      else items[at - 1].focus();
    } else if (e.key === "Escape") {
      closeSuggestions();
      headerInput.focus();
    }
  });
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
