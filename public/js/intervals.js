// The intervals page: each card's Hear it plays its two notes on the recorded piano (piano-sound.js), one after the
// other and then together, pressing their keys as they sound.
document.querySelectorAll(".interval-hear").forEach((button) => button.addEventListener("click", () => {
  const [low, high] = button.dataset.notes.split(" ").map(Number);
  const card = button.closest(".interval-card");
  const press = (abs, at, length) => {
    const key = card.querySelector(`.pkey[data-abs="${abs}"]`);
    setTimeout(() => key.classList.add("is-sounding"), at * 1000);
    setTimeout(() => key.classList.remove("is-sounding"), (at + length) * 1000);
  };
  playPiano(low, { length: 0.55 });
  press(low, 0, 0.5);
  playPiano(high, { delay: 0.6, length: 0.55 });
  press(high, 0.6, 0.5);
  [low, high].forEach((abs) => {
    playPiano(abs, { delay: 1.25, length: 1.3 });
    press(abs, 1.25, 1);
  });
}));
