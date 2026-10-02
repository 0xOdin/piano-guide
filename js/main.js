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