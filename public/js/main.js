// Light and dark. The script in the <head> has already set the theme; the toggle in the header flips it and
// remembers the choice in this browser. Until it is used, the page follows the device's setting, even as it changes.
const THEME_STORE = "pianoguide-theme";
const themeBtn = document.querySelector(".theme-btn");
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const pickedTheme = () => {
    try {
        return localStorage.getItem(THEME_STORE);
    } catch (e) {
        return null;
    }
};

function setTheme(theme, remember) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === "dark";
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
    document.querySelector('meta[name="theme-color"]').content = dark ? "#141210" : "#fafaf9";
    if (remember) {
        try {
            localStorage.setItem(THEME_STORE, theme);
        } catch (e) {
            // not kept: the toggle still works on this page
        }
    }
}

setTheme(document.documentElement.dataset.theme, false);
themeBtn.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
darkQuery.addEventListener("change", (e) => {
    if (!pickedTheme()) setTheme(e.matches ? "dark" : "light", false);
});

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
