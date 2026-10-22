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

// On a phone and a tablet the menu and the search box are panels that drop down under the header, one at a time.
// They close with their button, a click elsewhere, or Escape (which gives the keyboard back to the button).
function setMenu(open) {
    headerLinks.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Menu");
}

function setSearch(open) {
    searchForm.classList.toggle("is-open", open);
    searchBtn.setAttribute("aria-expanded", String(open));
}

menuBtn.addEventListener("click", () => {
    const open = !headerLinks.classList.contains("is-open");
    setMenu(open);
    setSearch(false);
    // the links come before the button on the page, so Tab from the button would skip them: start on the first
    if (open) headerLinks.querySelector("a").focus();
});

searchBtn.addEventListener("click", () => {
    const open = !searchForm.classList.contains("is-open");
    setSearch(open);
    setMenu(false);
    if (open) searchForm.querySelector("input").focus();
});

document.addEventListener("click", (event) => {
    if (!headerLinks.contains(event.target) && !menuBtn.contains(event.target)) setMenu(false);
    if (!searchForm.contains(event.target) && !searchBtn.contains(event.target)) setSearch(false);
});

document.addEventListener("keydown", (event) => {
    // the search box's suggestions close first (search.js marks that Escape as used)
    if (event.key === "Escape" && !event.defaultPrevented) {
        if (headerLinks.classList.contains("is-open")) {
            setMenu(false);
            menuBtn.focus();
        } else if (searchForm.classList.contains("is-open")) {
            setSearch(false);
            searchBtn.focus();
        }
        return;
    }
    // "/" goes to the search box from anywhere, unless a box has the keyboard (on the search page, its own box)
    const typing = event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable]");
    if (event.key !== "/" || typing || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const pageBox = document.getElementById("search-input");
    if (!pageBox && getComputedStyle(searchBtn).display !== "none") {
        setSearch(true);
        setMenu(false);
    }
    (pageBox || searchForm.querySelector("input")).focus();
});

// the panels belong to the narrow header: none is left open behind the desktop one
window.matchMedia("(min-width: 1024px)").addEventListener("change", () => {
    setMenu(false);
    setSearch(false);
});

// The keyboards you can play (the homepage, Keyboard, Practice): the Tab key stops on one key, not on all twenty-five,
// and the arrow keys move along the keys, Home and End to the ends. The key last moved to keeps the stop, also when
// the keys are drawn again.
function roveKeys(piano) {
    const keys = [...piano.querySelectorAll("button.pkey")];
    if (!keys.length) return;
    const at = keys.find((k) => k.dataset.abs === piano.dataset.roveAt) || keys[0];
    keys.forEach((k) => { k.tabIndex = k === at ? 0 : -1; });
}

document.querySelectorAll(".piano").forEach((piano) => {
    roveKeys(piano);
    new MutationObserver(() => roveKeys(piano)).observe(piano, { childList: true });
    piano.addEventListener("focusin", (event) => {
        const key = event.target.closest("button.pkey");
        if (!key) return;
        piano.dataset.roveAt = key.dataset.abs;
        roveKeys(piano);
    });
    piano.addEventListener("keydown", (event) => {
        const keys = [...piano.querySelectorAll("button.pkey")];
        const i = keys.indexOf(event.target);
        if (i < 0) return;
        const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: keys.length - 1 }[event.key];
        if (to === undefined) return;
        event.preventDefault();
        keys[Math.max(0, Math.min(keys.length - 1, to))].focus();
    });
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
