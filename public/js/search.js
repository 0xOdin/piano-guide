// Search page. Filters /search-index.json (the title and description of every page, written by scripts/build.js)
// by the words in ?q=. Note names can be typed as "F#", "F sharp", "Bb" or "B flat".
const input = document.getElementById("search-input");
const status = document.getElementById("search-status");
const results = document.getElementById("search-results");

// "F♯ minor" and "f# minor" both become "f sharp minor"
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/♯/g, " sharp ")
    .replace(/♭/g, " flat ")
    .replace(/\b([a-g])#(?=\s|$)/g, "$1 sharp")
    .replace(/\b([a-g])b(?=\s|$)/g, "$1 flat")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// a one-letter word (a note name) must match a whole word, a longer one the start of a word
const matches = (word, words) => words.some((w) => (word.length === 1 ? w === word : w.startsWith(word)));

function score(query, page) {
  let total = 0;
  for (const word of query) {
    if (matches(word, page.titleWords)) total += 3;
    else if (matches(word, page.descWords)) total += 1;
    else return 0; // every word has to be found somewhere
  }
  return total;
}

function show(pages, q) {
  results.innerHTML = "";
  const query = normalize(q);
  if (!query.length) {
    status.textContent = "";
    return;
  }
  const found = pages
    .map((page) => ({ page, s: score(query, page) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.page.title.length - b.page.title.length)
    .slice(0, 30);

  status.textContent = found.length
    ? `${found.length === 30 ? "Top 30" : found.length} result${found.length === 1 ? "" : "s"} for “${q}”`
    : `Nothing found for “${q}”. Try a key name such as “D minor”, or a word such as “arpeggio”.`;

  for (const { page } of found) {
    const li = document.createElement("li");
    li.className = "search-result";
    const h3 = document.createElement("h3");
    const a = document.createElement("a");
    a.href = page.url;
    a.textContent = page.title;
    h3.append(a);
    const p = document.createElement("p");
    p.textContent = page.description;
    li.append(h3, p);
    results.append(li);
  }
}

const q = new URLSearchParams(location.search).get("q") || "";
input.value = q;
document.getElementById("site-search").value = q;

fetch("/search-index.json")
  .then((r) => r.json())
  .then((index) => {
    const pages = index.map((p) => ({ ...p, titleWords: normalize(p.title), descWords: normalize(p.description) }));
    show(pages, q);
    // results update while typing; the address keeps the search so it can be shared or reloaded
    input.addEventListener("input", () => {
      show(pages, input.value.trim());
      history.replaceState(null, "", input.value.trim() ? `?q=${encodeURIComponent(input.value.trim())}` : location.pathname);
    });
  })
  .catch(() => {
    status.textContent = "Search could not be loaded. Please try again.";
  });
