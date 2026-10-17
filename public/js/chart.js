// Fingering charts: the 1 octave / 2 octaves switch. The page has both sets of finger numbers (written by
// scripts/build.js); the switch shows one of them, and the address keeps the choice (?octaves=2).
const chart = document.querySelector(".chart");
const octaveSeg = document.querySelector('.seg[data-key="octaves"]');

function showOctaves(v) {
  chart.dataset.octaves = v;
  octaveSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
}

octaveSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  showOctaves(b.dataset.v);
  history.replaceState(null, "", (b.dataset.v === "2" ? "?octaves=2" : location.pathname) + location.hash);
});

showOctaves(new URLSearchParams(location.search).get("octaves") === "2" ? "2" : "1");
