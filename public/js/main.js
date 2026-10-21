const menuBtn = document.querySelector(".menu-btn");
const headerLinks = document.querySelector(".header-links");
const searchBtn = document.querySelector(".search-btn");
const searchForm = document.querySelector(".search-form");

menuBtn.addEventListener("click", () => {
    headerLinks.classList.toggle("is-open");
    searchForm.classList.remove("is-open");
});

searchBtn.addEventListener("click", () => {
    searchForm.classList.toggle("is-open");
    headerLinks.classList.remove("is-open")
});

document.addEventListener("click", (event) => {
    if (!headerLinks.contains(event.target) && !menuBtn.contains(event.target)) {
        headerLinks.classList.remove("is-open");
    }

    if (!searchForm.contains(event.target) && !searchBtn.contains(event.target)) {
        searchForm.classList.remove("is-open");
    }
});
// Parts of a page marked .reveal fade up as they come into view (styles in main.css)
const revealed = document.querySelectorAll(".reveal");
if (revealed.length && "IntersectionObserver" in window) {
    const watcher = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-in");
            watcher.unobserve(entry.target);
        }
    }, { rootMargin: "0px 0px -8% 0px" });
    revealed.forEach((el) => watcher.observe(el));
} else {
    revealed.forEach((el) => el.classList.add("is-in"));
}
