// Local server for /dist/.   npm start   serves the last build;   npm run dev   also rebuilds the site whenever a
// file in src/, public/ or scripts/build.js changes, and reloads the open pages in the browser.
// Port: PORT=8080 npm run dev (default 3000). Needs only Node.js, no packages.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 3000;
const WATCH = process.argv.includes("--watch");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".m4a": "audio/mp4",
  ".webmanifest": "application/manifest+json",
};

// In watch mode every page gets this script: it reloads the page when the server says the build is done.
const RELOAD_SCRIPT = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;
const clients = new Set();

function build() {
  const t = Date.now();
  const result = spawnSync(process.execPath, [path.join(__dirname, "build.js")], { stdio: "inherit" });
  console.log(result.status === 0 ? `  (${Date.now() - t} ms)` : "  Build failed, see above.");
  return result.status === 0;
}

// /keys/c-major/ -> dist/keys/c-major/index.html, /keys/c-major -> redirect to the folder
function resolve(urlPath) {
  const file = path.join(DIST, decodeURIComponent(urlPath));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!urlPath.endsWith("/")) return { redirect: urlPath + "/" };
    return { file: path.join(file, "index.html") };
  }
  return { file };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (WATCH && url.pathname === "/__reload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const found = resolve(url.pathname);
  if (found && found.redirect) {
    res.writeHead(301, { Location: found.redirect + url.search });
    return res.end();
  }
  let file = found && found.file;
  let status = 200;
  if (!file || !fs.existsSync(file)) {
    file = path.join(DIST, "404.html"); // the site's own "page not found" page
    status = 404;
  }

  const type = TYPES[path.extname(file)] || "application/octet-stream";
  let body = fs.readFileSync(file);
  if (WATCH && type.startsWith("text/html")) body = body.toString().replace("</body>", `${RELOAD_SCRIPT}\n</body>`);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
});

if (WATCH || !fs.existsSync(DIST)) build();

if (WATCH) {
  let timer;
  const onChange = (dir) => (event, name) => {
    if (name && path.basename(name) === ".DS_Store") return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\nChanged: ${path.join(dir, name || "")}`);
      if (build()) for (const res of clients) res.write("data: reload\n\n");
    }, 100); // an editor often saves in several steps; build once
  };
  for (const dir of ["src", "public"]) fs.watch(path.join(ROOT, dir), { recursive: true }, onChange(dir));
  fs.watch(path.join(__dirname, "build.js"), onChange("scripts"));
}

server.listen(PORT, () => {
  console.log(`\nPianoGuide running at http://localhost:${PORT}${WATCH ? " (rebuilds on save)" : ""}`);
});
