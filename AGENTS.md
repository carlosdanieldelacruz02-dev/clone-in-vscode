# Agent notes — Clone in VS Code

## What this repo is

A browser extension (Manifest V3) written in plain HTML/JS. There is **no**
package manager, build step, test suite, database or external service, and no
runtime of its own: the browser loads `manifest.json` (Chrome/Edge) or
`manifest-ff.json` (Firefox) and the scripts next to it.

- `background.js` / `manifest.json` — Chrome, Edge and Chromium builds
- `background-ff.js` / `manifest-ff.json` — Firefox build
- `options.html` + `options.js` — the options page, shared by both
- `options-ff.html` — Firefox-only variant of the options page styling

## Running it in the Base44 preview

The preview iframe shows whatever listens on host port 3000, and an extension
has nothing to serve, so `docker-compose.base44.yml` runs a dev-only static
server (`devpreview/server.mjs`, no dependencies) that:

1. serves the repository read-only, with `/` mapped to `devpreview/index.html`;
2. injects `devpreview/chrome-shim.js` into the extension's own HTML pages
   (listed in `PAGES_NEEDING_SHIM` in `server.mjs` — add new extension pages
   there) so their real scripts can run in an ordinary page. A plain page has no
   `chrome.storage` / `chrome.action` / `chrome.tabs`; the shim supplies those on
   top of `localStorage`;
3. exposes `/__devpreview/version`, which the harness polls so edits to the
   extension source reload the preview automatically.

`devpreview/index.html` embeds the real options page in an iframe and drives the
click handler registered by the real `background.js`. `chrome.tabs.update` is
recorded instead of navigated to, so the harness can display the deep link
(`vscode://vscode.git/clone?url=...`) the extension would have opened — a
`vscode://` link cannot actually launch an editor inside the preview.

**Nothing in `devpreview/` ships with the extension.** The shared extension
files, manifests and options page are unmodified, so this setup needs no
`BASE44_PREVIEW_MODE` gate.

## Verifying a change

- `docker compose -f docker-compose.base44.yml up -d --build` (only the first
  boot or a compose change needs `--build`; the repo is bind-mounted).
- `curl -s http://localhost:3000/ | head` → the harness page.
- `curl -s http://localhost:3000/options.html | grep chrome-shim` → shim injected.
- In the preview: change protocol/application on the options page, save, then
  click the action. HTTPS + VS Code should yield
  `vscode://vscode.git/clone?url=https://github.com/<owner>/<repo>.git`; SSH
  should yield `git@github.com:<owner>/<repo>.git`. "Other" uses the typed URL
  scheme and disables Save while that scheme is blank.
- `docker compose -f docker-compose.base44.yml logs -f preview` for request logs.

To exercise the real extension, load the repo folder as an unpacked extension in
Chrome (`chrome://extensions` → Developer mode → Load unpacked) or load
`manifest-ff.json` as a temporary add-on in Firefox.

## Environment

No secrets and no infrastructure: nothing is needed in `/run/base44/app.env`.
