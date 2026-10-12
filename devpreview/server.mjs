// Dev-only preview server for the "Clone in VS Code" browser extension.
//
// A browser extension has no server of its own, so the sandbox preview needs
// something to listen on port 3000. This server, which is dev tooling and is
// never referenced by the extension itself:
//   1. serves the repository read-only, mapping "/" to devpreview/index.html
//   2. injects devpreview/chrome-shim.js into the extension's own HTML pages so
//      their real scripts run in an ordinary page (see devpreview/chrome-shim.js)
//   3. exposes /__devpreview/version so the harness can reload on source edits
//
// Run with: node devpreview/server.mjs   (PORT env var overrides 3000)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

// Extension pages that need the extension-API shim to run outside a real
// browser profile. Add new extension HTML pages here.
const PAGES_NEEDING_SHIM = new Set(["/options.html", "/options-ff.html"]);
const SHIM_TAG = '<script src="/devpreview/chrome-shim.js"></script>';

const SKIP_DIRS = new Set([".git", "node_modules"]);

// Digest of the served sources, used by the harness to auto-refresh on edits.
function sourceVersion() {
  let digest = 0;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (/\.(html|js|mjs|json|css)$/.test(entry.name)) {
        const stat = fs.statSync(full);
        digest = (digest * 31 + Math.round(stat.mtimeMs) + stat.size) % 1e15;
      }
    }
  };
  visit(root);
  return String(digest);
}

function send(res, status, contentType, body) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function resolveFile(pathname) {
  const filePath = path.resolve(root, "." + pathname);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) return null;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (stat.isDirectory()) {
    const indexFile = path.join(filePath, "index.html");
    if (!fs.existsSync(indexFile)) return null;
    return { filePath: indexFile, pathname: pathname.replace(/\/?$/, "/") + "index.html" };
  }
  return { filePath, pathname };
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "text/plain; charset=utf-8", "bad request");
  }

  if (pathname === "/__devpreview/version") {
    return send(res, 200, "text/plain; charset=utf-8", sourceVersion());
  }

  if (pathname === "/") pathname = "/devpreview/index.html";

  const resolved = resolveFile(pathname);
  if (!resolved) {
    console.log(`${req.method} ${pathname} -> 404`);
    return send(res, 404, "text/plain; charset=utf-8", "not found");
  }

  const ext = path.extname(resolved.filePath).toLowerCase();
  let body = fs.readFileSync(resolved.filePath);

  if (ext === ".html" && PAGES_NEEDING_SHIM.has(resolved.pathname) && body.includes("<head>")) {
    body = Buffer.from(
      body.toString("utf8").replace("<head>", `<head>\n  ${SHIM_TAG}`),
      "utf8"
    );
  }

  console.log(`${req.method} ${pathname} -> 200`);
  send(res, 200, MIME[ext] || "application/octet-stream", body);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Clone in VS Code dev preview listening on http://0.0.0.0:${port}`);
  console.log(`BASE44_PREVIEW_MODE=${process.env.BASE44_PREVIEW_MODE ?? "(unset)"}`);
});
