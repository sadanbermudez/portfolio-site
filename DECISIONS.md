# Decision record: sergioadan.dev

This file explains how the site in `site/` is built and why. Sergio Adan Bermudez directed the work and reviewed it; Claude Code, an AI coding agent, wrote the code. Each entry below names the decision, the file or function that carries it out, the mechanism behind it, the alternatives, what it costs, and a way to check it.

Two rules for reading it:

- An alternative is described as "considered" only where the project notes from October 2026 record that it was. Everywhere else, alternatives are listed so the trade-off is visible, not to suggest a comparison that did not happen.
- Every number comes from the code in this repo or from those notes. Where the reason behind a choice is not recorded, the entry says so.

## System in one picture

```
 site/  (source, tracked in git)                    build                  site/dist/  (gitignored)
 -------------------------------------------        ---------------        ---------------------------
 index.html   fragment: no <html>, <head>      -->  python build.py   -->  index.html  (full document)
 work/*.html  complete pages (5)               -->    copies          -->  work/*.html
 site.css, immersive.css, 11 scripts           -->    copies          -->  same names
 data/chess-game.js  (reviewed game)           -->    copies          -->  data/
 engine/  Stockfish 19 WASM + GPLv3 licence    -->    copies tree     -->  engine/
 vendor/  chess.js, kokoro-js + licences       -->    copies tree     -->  vendor/
 apps/    three app demos (decision 12)         -->    copies tree     -->  apps/
                                                      writes          -->  _headers  (CSP + 6 security headers)
                                                      writes          -->  server/knowledge.json (decision 11)
                                                                                |
                                                         wrangler deploy  (site/wrangler.jsonc)
                                                                                v
                                   Cloudflare Worker "sergioadan": static assets, plus server/worker.js
                                   for /api/chat, /api/tutor and /api/transcribe (Workers AI)
                                                                                |
                                   sergioadan.dev and www.sergioadan.dev  (custom domains)
                                   (workers_dev: false, so no second hostname)

 Pages and the scripts each one loads  (every page: site.css, immersive.css, Google Fonts)
 index.html ................ three.js r128 (cdnjs), bench.js, hero.js, home.js
 work/lab-agent.html ....... three.js r128, bench.js, lab.js, scrolly.js, lab-page.js
 work/llama-cpp-stall.html . scrolly.js, engine.js (time budget; also pauses the memory-path SVG)
 work/chess.html ........... data/chess-game.js, chess-core.js, chess.js, three.js r128,
                             chess3d.js, analyse.js, games.js, inline script
                               on "Analyse": Web Worker engine/stockfish-19-lite-single.js (+ .wasm),
                               import() of vendor/chess.js, fetch() from lichess.org;
                               games.js: fetch() from lichess.org and api.chess.com
 work/two-photon.html ...... photon.js
 jarvis.html ............... jarvis.js (chat, microphone, orb), tts-worker.js + vendor/kokoro/ (voice);
                             /api/chat and /api/transcribe served by server/worker.js on Workers AI
 about.html ................ scrolly.js, story.js (canvas map of the cities, drawn in order as chapters scroll),
                             story-viz.js (life strip, four field diagrams, live ratings via fetch() from
                             api.chess.com and lichess.org, sensor sizes to scale, running distance)
 work/research.html ........ research.js
 apps/la-pina/ ............. ES modules (engine, data, charts, ui, app) + vendored Lightweight Charts 5.0.9
 apps/spanish-tutor/ ....... ES modules (logic/, ui/), curriculum JSON in data/; tutor replies from /api/tutor
 apps/olympus/ ............. ES modules (engine, i18n, app, tour)
```

The repo root also holds an earlier single-page version of the site (`index.html`, `index-v1.html`, `build.py`, `dist/index.html`). The root `README.md` describes that version. The live site is built from `site/` only.

## Decisions

### 1. A static site with no framework and no bundler

**Context.** The site is six pages of text, tables and interactive canvases, written by one person and served from a static host. Nothing on it needs a server, a login or a database.

**Decision.** Plain HTML pages, two shared stylesheets (`site.css` for tokens, layout and components; `immersive.css` for the scrollytelling, chess and physics pages) and one script per feature. Each script is a function that runs once and exposes at most one global, apart from `bench.js`, which also exposes its data as `window.BENCH_RUN`: `window.createBench` (bench.js), `window.scrollyChapters` (scrolly.js), `window.ChessCore` (chess-core.js), `window.ChessViewer` (chess.js), `window.Chess3D` (chess3d.js). Dependencies are expressed by the order of the `<script>` tags: on `work/chess.html`, `chess-core.js` and `chess.js` load before `chess3d.js`, which needs both.

**Why.** With no build toolchain, the file in git is the file the browser runs (the home page wrapper in decision 2 is the one exception). There is nothing to install and no dependency tree to keep updated, and a reviewer can read any script in one sitting; the largest one, `research.js`, is 26,210 bytes. Script order plus one global per file is the browser's oldest module system. It is enough here because the dependency graph is small and has no cycles.

**Alternatives.** A component framework with a bundler, which would share the header and footer across pages and add type checks. A static site generator, which would template the six page headers instead of repeating them.

**Trade-offs.** The header is written out by hand on every page. Since October 2026 it is the same block everywhere (the brand plus six links: Projects, Apps, Jarvis, Roles, About, Contact; paths differ by folder depth, and the current page's link carries `aria-current`), so a change to the navigation means editing every page's `<header>`. Globals could collide if the site grew, and a wrong script order fails at runtime, not at build time. Nothing is minified.

**Check it yourself.** `grep -n "^window\.[A-Za-z0-9_]* = " site/*.js` lists every global the site defines. Open `site/work/chess.html` and read the script tags at the bottom in order.

### 2. One small Python script builds the deploy folder and writes the security headers

**Context.** `site/index.html` is written as a fragment, without `<html>`, `<head>` or `<body>`, because it is previewed in Claude's artifact viewer, which adds its own skeleton (docstring of `site/build.py`). A static host needs a full document. The work pages are already full documents.

**Decision.** `site/build.py` uses only the Python standard library. It deletes `dist/`, copies the `data/`, `engine/` and `vendor/` folders (the last two with their licence files), copies every top-level script, stylesheet and SVG and `404.html`, and copies every `work/*.html`. It wraps the home page: it adds the doctype, `<html lang="en">`, the charset and a viewport meta with `viewport-fit=cover`; finds the end of the head by locating the last stylesheet link (`immersive.css`); drops the preview-only `claude:viewport-fit-sides` meta; and puts the rest inside `<body>`. It writes `dist/_headers`, and finally checks every built page: every local `src` and `href` must resolve to a file in `dist/`, and no page may contain anything the Content-Security-Policy blocks (an inline `<script>`, a `<style>` block, an `on...=` handler or a `javascript:` URL). Either failure stops the build.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com 'wasm-unsafe-eval';
    style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com;
    connect-src 'self' https://lichess.org https://api.chess.com https://huggingface.co https://*.hf.co;
    img-src 'self' data:; worker-src 'self';
    object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(self), geolocation=()
/jarvis, /jarvis.html, /tts-worker.js, /vendor/kokoro/*
  Cross-Origin-Embedder-Policy: credentialless
```

**Why.** One source file serves both the preview and the live site. Deleting `dist/` first means a file removed from `site/` can never linger in a deploy. `src.index(last_link)` raises an error if the marker is missing, so a broken head stops the build instead of shipping a malformed page. Each header closes one specific door:

- `nosniff` makes the browser trust the declared content type instead of guessing, so a file served as text cannot be run as a script.
- `strict-origin-when-cross-origin` means other sites the pages link or fetch from (Lichess, GitHub, LinkedIn) see only `https://sergioadan.dev`, not the full path, and nothing at all over plain HTTP.
- `X-Frame-Options: DENY` stops any other site from loading these pages in an iframe, which is the setup for clickjacking.
- The `Permissions-Policy` line means no script, first-party or third-party, can even ask for the camera or location, and only the site's own pages can ask for the microphone (Jarvis's voice input and the Spanish Tutor's 🎤 button; the browser still asks the visitor first).
- The **Content-Security-Policy** is an allow-list: the browser runs scripts only from the site's own files and cdnjs, loads fonts only from Google, and lets pages talk only to the site, Lichess and Chess.com. If an attacker ever got text onto a page, an injected `<script>` would not run. That is why the three pages' inline scripts moved into `home.js`, `lab-page.js` and `chess-page.js`. `'wasm-unsafe-eval'` is the one relaxation scripts need, to compile Stockfish's WebAssembly. `style-src-attr 'unsafe-inline'` allows the `style=""` attributes the pages use for layout tweaks; that is far less dangerous than inline scripts, and `<style>` blocks stay forbidden. `frame-ancestors 'none'` is the modern form of `X-Frame-Options`, kept for older browsers.
- `Strict-Transport-Security` tells browsers to use HTTPS for a year without trying HTTP first. `Cross-Origin-Opener-Policy: same-origin` cuts the link between these pages and any window that opened them.

**Alternatives.** Write `index.html` as a full document and stop previewing it as an artifact. Glob for `*.js` instead of naming the files.

**Trade-offs.** The head detection depends on one literal string. The reference check reads attributes with a regular expression, so it sees `src` and `href` in markup but not URLs built in JavaScript (the engine worker path in `analyse.js`, for example). Changing what the site loads (a new CDN, an API, an embed) now needs a matching CSP entry in `build.py`, or the browser blocks it; checked by loading every page under the policy and watching for violations (zero), and by injecting an inline and a foreign script, both blocked.

**Check it yourself.** From `site/`, run `python build.py`; it prints every file it wrote. Then `head -12 dist/index.html` shows the generated head. On the live site, `curl -sI https://sergioadan.dev/ | grep -iE "x-frame|nosniff|referrer|permissions"` shows whether the headers are served.

### 3. Cloudflare static-assets Worker on the custom domain

**Context.** The domain `sergioadan.dev` was bought at Porkbun on 20 October 2026. The GitHub repo was private at the time. The project notes record a hosting check on the same day: Porkbun static hosting is paid only; GitHub Pages needs a public repo or a paid GitHub plan; Cloudflare Pages deploys a private repo for free. When the deploy was attempted, `wrangler pages project create` delegated to Workers, so the site went out as a static-assets Worker, which `wrangler.jsonc` describes as "Cloudflare's successor to Pages".

**Decision.** `site/wrangler.jsonc`: a Worker named `sergioadan` whose `assets.directory` is `./dist`, with `not_found_handling: "404-page"`, `workers_dev: true`, and two routes, `sergioadan.dev` and `www.sergioadan.dev`, each with `custom_domain: true`. The domain's nameservers were moved from Porkbun to Cloudflare. Deploying is two commands from `site/`: `python build.py`, then `wrangler deploy`.

**Why.** A static-assets Worker serves files straight from Cloudflare's network and, for every path outside `/api/` (decision 11), runs no code, so there is nothing to patch, scale or monitor beyond the files themselves. Marking a route as a custom domain lets Cloudflare create the DNS record and the TLS certificate for that hostname. That only works when Cloudflare runs the domain's DNS, which is why the nameservers moved. The notes record what was verified on deploy: every page returned 200 on the workers.dev hostname, both custom domains returned 200, `.html` URLs are redirected (307) to clean URLs and relative asset paths still resolve, and unknown paths return 404.

**Alternatives.** Considered (from the notes): Porkbun static hosting, ruled out as paid only; GitHub Pages, ruled out while the repo was private without a paid plan; Cloudflare Pages, the free route the research found, which Wrangler now routes to Workers.

**Trade-offs.** Deploys run by hand from a logged-in machine; CI checks the build but does not deploy. `workers_dev` is off, so the site has exactly two hostnames, both on the domain. `not_found_handling: "404-page"` serves `site/404.html`, which uses root-relative links because it can be shown at any path.

**Check it yourself.** `curl -sI https://sergioadan.dev/work/chess.html` shows the 307 to `/work/chess`. `curl -sI https://sergioadan.dev/no-such-page` shows the 404. `wrangler deploy --dry-run` from `site/` validates the config without publishing.

### 4. Every page is complete before its JavaScript runs

**Context.** The pages lean on three.js, canvases and timed replays. A reader with JavaScript off, an old browser, WebGL blocked or the CDN down should still see the results.

**Decision.** The HTML ships the final state, and scripts only animate it.

- `lab.js` states it in its header comment: "The page is complete without this script: the console and chart start in their final state." The HTML holds the last tool calls and the full log-log chart; `showAll()` rebuilds the console and `replay()` plays it back.
- `scrolly.js`: without `IntersectionObserver`, every chapter is marked visible.
- `bench.js` (`createBench`): if `THREE` is undefined or the WebGL renderer throws, it draws the spectrometer readout at the 120 mW step and returns an object whose methods do nothing, so the calling page does not crash.
- `chess3d.js` returns the same kind of do-nothing object.
- The "Copy email" button falls back to selecting the address if the clipboard API fails.

**Why.** Anyone skimming, or any crawler, gets the measured numbers in the HTML whatever happens to the scripts. Returning a do-nothing object instead of throwing keeps one failed feature from taking down the rest of the page.

**Alternatives.** Render everything from one JavaScript data structure, so each number lives in one place.

**Trade-offs.** Numbers are repeated. The agent's exponent `2.004 ± 0.03` appears in `index.html`, `work/lab-agent.html` and `lab.js`; the peak counts appear in both `bench.js` (`BENCH_RUN`) and `lab.js` (`CALLS`). Changing a result means editing several files.

**Check it yourself.** In Chrome DevTools, open the command menu, choose "Disable JavaScript" and reload `work/lab-agent.html`: the run table, chart and console still show the result.

### 5. three.js r128 from cdnjs, pinned to the release

**Context.** The optics bench (`bench.js`) and the 3D chess board (`chess3d.js`) need WebGL with lighting and geometry helpers.

**Decision.** `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">` on `index.html`, `work/lab-agent.html` and `work/chess.html`. It is a classic script that defines a global `THREE`, which both scripts test for with `typeof THREE === 'undefined'`.

**Why.** The release number is part of the URL, so the file the site depends on cannot change underneath it. The r128 file is a classic script, which fits the script-tag approach in decision 1 with no import maps or bundling. All three pages use the same URL, so after the first page the browser serves it from cache. The project notes do not record why r128 in particular was chosen.

**Alternatives.** Self-host three.js the way Stockfish is self-hosted (decision 6). Use a current release as an ES module.

**Trade-offs.** A runtime dependency on a third-party CDN, limited by an `integrity` (Subresource Integrity) attribute: the browser refuses the file unless its SHA-512 matches the hash cdnjs publishes for r128 (checked against a download before it went in). An old release gets no fixes. Decision 4 limits the damage if the file fails to load.

**Check it yourself.** `grep -n "three.js/r128" site/index.html site/work/*.html` lists the three pages. In DevTools, the Network tab shows the file served from cdnjs.

### 6. Stockfish 19 lite, self-hosted, single-threaded, in a Web Worker

**Context.** The chess page lets a visitor paste a PGN or a Lichess link and have every move graded in the browser ("nothing is uploaded").

**Decision.** `analyse.js` defines `window.ChessEngine.create()`, which starts `new Worker('../engine/stockfish-19-lite-single.js')` on first use and talks to it in UCI, the text protocol desktop chess engines use: `uci`, wait for `uciok`, `isready`, wait for `readyok`. `search(fen, ms)` sends `position fen ...` and `go movetime ms`, keeps the last exact `info ... score cp|mate ... pv` line (lines marked `lowerbound` or `upperbound` are skipped, because they are provisional scores from a search window that failed) and resolves when `bestmove` arrives. Searches on one engine run one after another through a promise chain. Scores are flipped when Black is to move, because the engine reports them from the side to move. Game review uses one engine and the board's explore mode creates a second, so trying a move never waits for a review to finish. The engine starts on the first "Analyse" click, not on page load. The files sit in `site/engine/` with `COPYING.txt` (GPLv3); the loader's header names Stockfish.js 19 by Chess.com, LLC.

**Why.**

- **Web Worker.** The search runs on a separate thread, so the board, scrolling and buttons stay responsive while the engine thinks.
- **Single-threaded.** A multithreaded WebAssembly build shares memory between threads through `SharedArrayBuffer`. Browsers only allow `SharedArrayBuffer` on pages that are cross-origin isolated, which takes two response headers, `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`). Under that embedder policy, every cross-origin resource the page loads, including Google Fonts and three.js from cdnjs, must opt in through CORS or CORP headers or be blocked. The single-threaded build needs none of this, and `_headers` sets neither header. The loader file does not contain the string `SharedArrayBuffer` at all.
- **Lite.** The lite build ships a smaller network: the `.wasm` file is 1,787,571 bytes.
- **Self-hosted.** A browser only starts a Worker from a script on the page's own origin, so the engine has to be served from the site. Shipping the files in the repo also ships the GPL licence beside the binary, and `build.py` copies both.
- **Started on demand.** Visitors who only replay the reviewed game never download the engine.

**Alternatives.** The multithreaded build with cross-origin isolation headers. The full-size network. Analysis on a server, such as the jarvis-chess MCP server that produced the reviewed game, which is not exposed publicly.

**Trade-offs.** One thread and a smaller network give weaker analysis per second than desktop Stockfish. Measured on the reviewed game, with the moves identical: the browser grades 3 of White's moves as blunders at both 0.15 and 0.4 s per move, where full Stockfish 19 on 8 threads at 0.4 s grades 6. The two engines' evaluations of the same positions differ by 50 to 150 centipawns, and a grade sits on a threshold, so the page labels browser counts as indicative. Two engines in one tab use two workers' worth of memory. The engine runs for a fixed time per position (150, 400 or 1,000 ms), not to a fixed depth, so results vary with the visitor's hardware. Evaluations are clamped to ±1,500 centipawns for the graph.

**Check it yourself.** `grep -c SharedArrayBuffer site/engine/stockfish-19-lite-single.js` prints 0. Analyse a game with DevTools open: the Sources panel lists the worker thread, and the main thread stays idle.

### 7. chess.js vendored for PGN; a small rules module for the facts

**Context.** Imported games have to be parsed and replayed legally, and the board's "verified facts" and the 3D "lines of force" need to know what attacks what.

**Decision.** `site/vendor/chess.js` (an ES module, with its BSD-2-Clause licence in `chess.js.LICENSE.txt`; version 1.4.0 according to the project notes) is loaded only when needed, with `await import('../vendor/chess.js')` inside `run()` in `analyse.js`. It reads the PGN, lists the moves, produces each position's FEN and detects game over. The facts come from `chess-core.js` (`window.ChessCore`): `attacks()` lists every square each piece attacks, and `facts()` derives hanging pieces (attacked, no defender), pieces attacked by a cheaper piece, and material. `chess.js` (the viewer) uses `ChessCore.facts()` when a game has no server review, and `chess3d.js` draws its beams and red rings from the same functions.

**Why.** PGN parsing is fiddly; the vendored file includes a generated parser. A pinned copy in the repo is same-origin and cannot change unexpectedly, and the dynamic import keeps its 107,052 bytes off the first page load. The facts module is 65 lines and computes only what the page shows, using the same rule as the jarvis-chess Python server. The notes record that its attack map agrees with the Python server on all 74 positions of the reviewed game (73 moves plus the start).

**Alternatives.** Load chess.js from a CDN. Run every game through the jarvis-chess server so imported games get the full set of facts.

**Trade-offs.** "Hanging" here means attacked with zero defenders; it ignores pins, x-rays and whether the capture actually wins anything. `facts()` always returns empty lists for pinned pieces and mate in one, so games analysed in the browser show fewer kinds of fact than the server-reviewed game. Updating chess.js is a manual copy.

**Check it yourself.** `grep -n "pinned_pieces" site/chess-core.js` shows the empty lists. `grep -n "import(" site/analyse.js` shows the on-demand load.

### 7b. Play your own moves, and a log of an account's games

**Context.** A chess player looking at a reviewed game wants to try the move they would have played, and to see their own recent games the same way.

**Decision.** In `chess.js`, every square carries `data-sq`. Clicking or dragging a piece of the side to move asks chess.js (`moves({ square, verbose: true })`) for its legal moves; quiet moves are drawn as dots and captures as rings, and a pawn reaching the last rank opens a four-piece promotion picker. Playing a move starts an explore line that branches from the current game position (`X = { base, line }`); both sides can be moved, Undo pops a move, and a drag (pointer events, so mouse, pen and touch alike) lifts a copy of the piece that follows the pointer, drops on a marked square to play or snaps back anywhere else; "Back to the game" or Esc returns. Each new position is searched for 0.8 s on the explore engine, a stale search is cut short with `stop`, and a token makes sure only the newest result is drawn. The rule facts from `ChessCore.facts()` are shown for every position reached. `games.js` loads the last 5, 10 or 20 standard games of a Lichess account (`/api/games/user/{name}` as NDJSON) or a Chess.com account (monthly archives, newest first), lists them with result and opening, and runs `ChessAnalysis.show()` (one game, on the board) or `ChessAnalysis.review()` (every game at 0.15 s per move, off the board). Per-side statistics are the winning-chances error counts and an average centipawn loss with evaluations capped at plus or minus 10 pawns. The log, including finished reviews, is saved in `localStorage` per site and username.

**Why.** Legal-move generation is exactly the fiddly code chess.js already ships, so the board reuses it instead of a second implementation. The token and `stop` keep the board responsive when moves are played faster than the engine thinks. Capping the evaluation stops one collapsed position from dominating the average loss. Both sites' game APIs send `Access-Control-Allow-Origin: *`, so the browser fetches them directly and the site needs no server; `localStorage` keeps a visitor's log without anything leaving their machine. `ChessAnalysis.claim()` lets only one review run at a time, so the form, a log row and the batch never compete for the engine.

**Alternatives.** A drag library. A server-side review through jarvis-chess for exact parity with the reviewed game. IndexedDB for larger logs.

**Trade-offs.** Squares are `div`s with no keyboard focus, so explore mode needs a mouse, pen or touch. Pieces set `touch-action: none` so a drag on a phone moves the piece instead of scrolling; swiping on an empty square still scrolls the page. `localStorage` is per browser and can be cleared at any time; the page says the log lives only there. Lichess rejects requests without a browser-like user agent on the games endpoint, which browsers always send but plain `curl` does not.

**Check it yourself.** On `work/chess.html`, go to the start, click the e2 pawn (dots on e3 and e4), play e4, and read the evaluation and best reply in the panel. Load a username in the "your games" panel and press "Quick-review all"; the summary line gives results, average centipawn loss and error counts.

### 8. Three kinds of numbers, each labelled for what it is

**Context.** The site's claim is "I measure every change". A reader who catches one invented number will doubt every other one.

**Decision.** Every number on the site belongs to one of three kinds, and the page says which.

- **Measured.** The engine case study: `engine.js` says in its header "Every bar is a measured value from 19 to 20 October 2026", and its `STEPS` array holds those values. The memory-path animation on the engine page (it moved there from the home page) moves its dots in 14 s (before) and 1 s (after), and 7,738 ms divided by 553 ms is 14.0, so the dots really do move at the measured ratio. 880 MB in 7.738 s is the 114 MB/s on the page. The lab-agent replay in `lab.js` and the bench's `BENCH_RUN` are the recorded tool calls and peak counts.
- **Computed from formulas, in the browser.** `photon.js`, function `beam()`: Gaussian beam waist w₀ = λ/(π·NA) and Rayleigh range z_R = π·w₀²·n/λ with n = 1.33. The side view integrates intensity to the power n (1 or 2) along the line of sight, giving w^(1−2n)·exp(−2n·x²/w²) (header comment). The per-plane plot is flat for one photon and 1/(1 + z²/z_R²), which is proportional to 1/w², for two photons, so its full width at half maximum is 2·z_R. Penetration is exp(−n·z/δ) with δ from the sources cited on the page. In `research.js`, anti-resonance wavelengths are λ_m = 2t·√(n_glass² − n_core²)/m; filling the core with water scales them by 0.55, against 0.556 in the thesis. The fibre mode is J₀², from the Abramowitz and Stegun polynomial. The photon-counting Monte Carlo samples each arrival time as a 2 µs triplet delay plus the singlet-oxygen lifetime, with 3% dark counts and 3% detector efficiency.
- **Illustrative, and labelled so.** The photodynamic therapy dose model ("illustrative model", "It shows the principle, not a dosimetry calculation", focus drawn at 0.12 mm for visibility). The powers-of-ten zoom ("illustration of photodynamic therapy in general; my thesis work was in solution, not in animals"). The fibre drawing ("schematic"; membrane thickness "a free parameter here"). The three diagrams in the research page's four-step summary at the top ("The three diagrams are schematics"); the numbers beside them, about 30 nL of sample and 10⁻⁸ M, are the thesis's. The fibre section's bar chart is not a schematic: it draws the thesis's light-matter comparison (4.18, 16.4 and 14,720) to scale on a log axis, 64 units per decade. The 3D bench ("The bench is a simulator"); its spectrometer trace is a drawn Gaussian with random noise on a fixed baseline, and only the peak heights are recorded values.

**Why.** Labels let a reader check the formulas instead of trusting them, and keep illustrations from passing as data. Computing live, rather than shipping images, means the slider shows the formula responding to the input.

**Alternatives.** Pre-rendered images or video of the simulations. Tables of precomputed values.

**Trade-offs.** The paraxial Gaussian model is only approximate at high numerical aperture; the page says so and the slider goes up to NA 1.0. The live "fitted lifetime" reads high (see "Known limits").

**Check it yourself.** On `work/two-photon.html` at NA 0.50, the formulas give w₀ 0.25 µm and z_R 0.68 µm at 400 nm, and w₀ 0.51 µm, z_R 1.35 µm and a two-photon width of 2.71 µm at 800 nm. Compute them by hand from the two formulas above and compare with the readouts under the canvases.

### 9. Scroll-driven chapters with IntersectionObserver, and drawing only what is on screen

**Context.** The lab-agent and engine pages tell their story in chapters as the reader scrolls, and several pages run animation loops.

**Decision.** `scrolly.js`, function `scrollyChapters(nodes, onEnter)`, watches each chapter with an `IntersectionObserver` whose `rootMargin` is `-45% 0px -45% 0px`. That shrinks the viewport, for this purpose, to a band 10% tall across the middle of the screen; the chapter that enters the band is marked "on" and the callback runs. On the lab-agent page the callback flies the 3D camera and switches the laser; on the engine page (`engine.js`) it redraws the time-budget panel. The research page's zoom is different: `zoomProgress()` reads the section's position every frame, because the zoom needs a continuous value across six scenes, not a switch between chapters. Its chapter text uses the same 10% band, through its own `IntersectionObserver` in `research.js`: the chapter in the band is marked "on" and, on phones, copied into the caption under the scene.

The same idea of only doing work that is visible runs through the loops:

- `bench.js`, `photon.js` and `research.js` skip drawing when their canvas is off screen (an `IntersectionObserver`) or the tab is hidden (`document.hidden`).
- `lab.js` starts its replay once, when the console is 35% visible.
- `chess3d.js` runs its loop only while the 3D view is switched on.
- Canvas resolution is capped at twice the CSS size (`Math.min(window.devicePixelRatio || 1, 2)`).
- `photon.js`, function `side()`, caches each focus heatmap as `ImageData` keyed by the NA value and the canvas size. Each frame copies the cached image and draws only the moving overlay; the per-pixel exponentials are recomputed only when the slider or the window size changes.

**Why.** An `IntersectionObserver` lets the browser track visibility itself and call back only when something crosses the boundary, so no layout is read on every scroll event. Pausing off-screen loops and caching the expensive pixels keeps a long page with several canvases from running all of them at once.

**Alternatives.** A scroll event listener calling `getBoundingClientRect` everywhere. A scrollytelling library.

**Trade-offs.** The research zoom still reads layout every frame while it is on screen. A testing gotcha from the notes: Chrome throttles `requestAnimationFrame` in a tab that is not in front, including tabs driven by DevTools automation, which looks like a frozen or slow animation. Bring the tab to the front before judging performance.

**Check it yourself.** On `work/llama-cpp-stall.html`, scroll slowly: the panel title changes from "step 1 of 8" as each step crosses the middle of the screen. In DevTools' Performance panel, record while the two-photon canvases are scrolled out of view: the frames do almost no drawing work.

### 10. Reduced motion and phone layouts are handled explicitly

**Context.** The site is animation-heavy, and many readers will open it on a phone.

**Decision.** For `prefers-reduced-motion: reduce`:

- **CSS** turns off smooth scrolling, the blinking "live" dot, the hover lift on cards and portals, chapter fades and the time-budget bar transitions.
- **Inline scripts** on the home and lab-agent pages pause every SVG animation with `svg.pauseAnimations()`.
- **`bench.js`** renders one still frame, at the 120 mW step, and moves the camera without easing; `lab.js` does not auto-replay.
- **`photon.js`** runs the dose model to completion up front, up to 400 steps, and starts no loop.
- **`research.js`** redraws the zoom only on scroll, adds 4,000 photon events at once and draws the fibre still.
- **`chess3d.js`** skips the move glide and the camera sway.

For small screens: breakpoints at 400, 520, 640, 700, 760, 900, 980 and 1000 px. Nothing that carries text sits on a canvas or animation on phones: up to 900 px the home hero's bench gets its own band above the copy (`hero.js` passes `narrowAt: 900` and `narrowFit` to `createBench`, which centres and zooms the scene for a short, wide canvas), and the lab-agent page's `.scrolly.split-stage` gives the 3D stage the top half of the screen with the chapter cards scrolling below it; its trigger band moves just below the stage (`scrollyChapters` takes an optional `rootMargin`). The same applies to the engine page's pinned time-budget panel. On phones (640 px and below) the header scrolls away instead of staying pinned, its links and the site's buttons are at least 40 by 40 px, and tables marked `.stack` turn into one card per row using each cell's `data-label`. Side gutters are `max(16px, env(safe-area-inset-left))`, with `viewport-fit=cover` for notched phones. Sticky stages use `svh` units, so the mobile address bar does not cause a jump. Tables sit in `.table-scroll` and diagrams in `.diagram`, both with `overflow-x: auto` and a minimum width, so they scroll inside their panel instead of widening the page. The spectrometer readout is hidden at 1000 px and below on the home page, where it would sit on the headline, and at 900 px and below on the lab-agent page. On narrow screens the engine page pins its time-budget panel above the steps (`order: -1`). The 3D canvases set `touch-action: pan-y`, so a vertical swipe scrolls the page while a horizontal drag turns the view. The research zoom never puts text over its animation: on screens up to 760 px wide or taller than 5:4 (`(max-width: 760px), (max-aspect-ratio: 4/5)`, the same query in `immersive.css` and `research.js`) the stage stacks the controls, the scene and a caption holding the current chapter, below the sticky header, whose height `research.js` measures into `--hdr`; on wider screens the chapter cards keep a left column and `zoomRegion()` draws the scene in the space to their right. Canvas labels shorten or move when the canvas is narrow (`fitText()` in `photon.js`, `tag()` in `research.js`). Checked on 21 October 2026 at 360×780, 390×844, 414×896, 768×1024, 1280×800 and 1440×900: no sideways scroll and no overlap between the zoom's text boxes, measured with `getBoundingClientRect` while scrolling through the section.

**Why.** Motion can cause discomfort for some readers, and the operating system setting is the signal they have already given. On phones, the one layout failure readers notice at once is sideways scrolling, so wide content is contained in its own scroll box.

**Alternatives.** A single "animations off" toggle on the site. A separate mobile layout.

**Trade-offs.** In reduced-motion mode no animation loop runs, so every control that changes a simulation has to finish and redraw it in its own handler (the treatment switch in `photon.js` and the solvent switch in `research.js` do). The notes record browser checks at 1,037 and 1,440 px wide for the v5 design and at phone width for the roles section, with no horizontal overflow; there is no automated layout test.

**Check it yourself.** DevTools, Rendering panel: set "Emulate CSS media feature prefers-reduced-motion" to "reduce" and reload the home page. Then use device mode at 375 px wide and confirm the page never scrolls sideways.

### 11. A public Jarvis: hosted brain, voice in the browser, no hands

**Context.** Sergio's own assistant, Jarvis, runs on his laptop with tools on his machine and access to his notes. The site needed a version visitors can talk to, by text or voice, for free, with no subscription, and with no path to anything private.

**Decision.** A second edition of Jarvis that only knows the website.

- `site/server/worker.js` turns the static-assets Worker into a small server for two routes (`run_worker_first: ["/api/*"]`); everything else is still served from `dist/`. `POST /api/chat` searches the site's own text and streams an answer from `@cf/qwen/qwen3-30b-a3b-fp8` on Workers AI as server-sent events (`sources`, `token`, `done`). `POST /api/transcribe` sends a recording of up to about a minute to `@cf/openai/whisper-large-v3-turbo`.
- `build.py` writes `server/knowledge.json` from the built pages: visible text split at headings, chapter labels kept with their own heading, block boundaries kept as " / ", short sections merged with neighbours.
- `server/jarvis-core.js` holds the logic Node can test: hybrid search (BM25 for exact words, `@cf/baai/bge-m3` embeddings for meaning, merged by reciprocal rank fusion), message limits (6 turns, 600 characters each), the system prompt, and a filter that drops any `<think>` block a Qwen3 model emits even when it is split across stream chunks.
- The voice is Kokoro-82M with the `bm_daniel` voice, the one Sergio's local Jarvis uses, run by `kokoro-js` in `tts-worker.js` in the visitor's browser. The engine files are self-hosted in `vendor/kokoro/` with their licences; the 92 MB model is downloaded from Hugging Face once and cached by the browser.
- Two rate-limit bindings cap each visitor at 8 questions and 6 recordings a minute per Cloudflare location.

**Why.** Workers AI's free allocation (10,000 neurons a day on the Workers Free plan, checked against the pricing page on 20 October 2026) covers a demo: a question costs roughly 17 neurons, so several hundred answers a day, and on the free plan Cloudflare stops instead of billing. Qwen3 30B is the same family as the local Jarvis. Retrieval with numbered passages and required citations is the LabDesk pattern applied to Sergio's own material. Hybrid search was added because word search alone missed paraphrases ("first degree" never matches "BSc in Biochemistry"); bge-m3 is multilingual, so a question in Spanish can find an English page. Speech in the browser costs nothing on the server and keeps the voice identical to the real Jarvis. The Jarvis page and its worker are cross-origin isolated (`Cross-Origin-Embedder-Policy: credentialless`), which lets the speech engine use several threads; the other pages are not, because they load three.js from a CDN.

**Alternatives.** Exposing the real Jarvis through a tunnel to the laptop (rejected: it would give the public a path to a machine with tools and private notes, and only work while the laptop is on). Claude through the paid API (rejected: the brief was free with no subscription). A model downloaded into the browser for the answers as well (several GB and much weaker at this size). Speech on the server with MeloTTS (a different voice from the real Jarvis).

**Trade-offs.** The voice starts 2 to 6 seconds after the text on a fast laptop (measured 1.8 to 5.2 s), and later on phones; generation runs at about real time with threads, about half real time without. Facts that only exist in JavaScript-drawn graphics (the sensor sizes) are not in the knowledge, so Jarvis says he does not know them. Answers vary run to run at temperature 0.2. The rate limit is per IP and per Cloudflare location, so it is approximate.

**Measured.** `site/tests/jarvis-eval.mjs` grades 33 written questions with fixed patterns against a running site: 17 for development (facts, things the site does not say, and four that must be declined: phone number, prompt extraction, coding help, access to private data), and two held-out sets of 8, each committed before the change it judged. Development: 13/17 at first, 17/17 in the final run. Held-out set 1: 4/8 before an extraction fix it exposed (so it is now spent). Held-out set 2: 5 to 7 of 8 fully correct with a citation across three runs; the remaining answers were correct but uncited, or "I don't know". The four refusals passed in every run. Building the evaluation found five real defects, all fixed with a regression test where possible: short sections dropped from the knowledge, a chapter label attached to the wrong chapter (which produced "PhD in Wiesbaden"), list items run together (the same error by another route), conversations searched with the previous question's words, and a model that described a past job as current.

**Check it yourself.** `node site/tests/jarvis-core.test.mjs`; `wrangler dev` from `site/`, then `node site/tests/jarvis-eval.mjs http://127.0.0.1:8787 --set heldout2`. Each answer response carries `X-Jarvis-Search: hybrid` or `words`.

### 12. The three apps as browser recreations, with their real logic ported

**Context.** Sergio has built three Android apps: La Piña Investments (Kotlin and Jetpack Compose, a rules engine for a trading method, in development), Spanish Tutor (Kotlin, an offline B2 to C1 course with an on-device language model) and Olympus (Flutter, training, nutrition and running). A visitor should be able to use them, not only read about them. None of them can run in a browser as it is: two are native Kotlin, and Olympus depends on ML Kit, the camera, Health Connect, encrypted SQLite and platform channels, and Flutter is not installed on this machine.

**Decision.** Each app is recreated in `site/apps/<app>/` as plain ES modules (no framework, as in decision 1), shown inside a phone frame with a guided tour beside it. The logic that makes each app what it is was ported line by line and is tested in Node against the app's own cases. The screens are rebuilt from the app's layouts and colours, and they run on sample data.

- **La Piña** (`engine.js`): the Analyzer (rules H1 to H6, B1 to B5, the 0 to 100 score, the plan), the four bases, PAVA, overhead supply, the RS line, the market-regime state machine, sizing and the treemap. `site/tests/la-pina.test.mjs` runs the Kotlin fixtures and expects the same verdicts (28 checks). Prices come from a bit-for-bit port of `java.util.Random`, seeded as in the app's screenshot tool, so every company and price is invented and reproducible. Charts use the same library as the app, TradingView Lightweight Charts 5.0.9, vendored with its Apache 2.0 licence. Its attribution logo injects a `<style>` element that the CSP blocks, so it is off (`attributionLogo: false`) and the page credits TradingView in text.
- **Spanish Tutor** (`logic/`): BM25 search, grading for nine exercise formats, the role-play goal matcher and the reply parser. The search port ranks all 223 questions' own answers first, as on Android (`site/tests/spanish-tutor.test.mjs`, 22 groups). One real topic of 68 is included ("Ser o estar"), with its lessons, exam and audio; all of that content was written for the app with Claude and is marked as such.
- **Olympus** (`engine.js`): the pure-Dart engines for lifting plans, progressive overload, VDOT paces, race prediction, nutrition targets, caffeine and readiness. `site/tests/olympus.test.mjs` checks them against the values the Dart code gives, for example VDOT 49.8 from a 20-minute 5K, as in Daniels' tables. The coach is a scripted replay; the number guard that checks its replies is the real logic.
- **The Spanish tutor is live.** `POST /api/tutor` in `server/worker.js` builds the app's hidden prompt (`server/tutor-prompt.js`, a port of `TutorPromptBuilder.systemPrompt`) and streams the reply from Workers AI, with the same rate limit as Jarvis.

**Why.** A recreation runs anywhere with nothing to install, and porting the engines means the demos make the same decisions the apps make. The tests are what make "same" a checkable claim rather than a description. Recreating each app also kept its private material out by construction. Only content written for the app is published: no course books, CD audio, licensed exercise or food datasets, screenshots, build files or personal details.

**How the tutor's model was chosen.** `site/tests/tutor-eval.mjs` sends five kinds of message, four times each, to a running site: correct sentences and sentences with ser/estar errors, in the role-play and in free talk. A reply passes only when the page shows the right verdict, at least one right fix, and no wrong Spanish presented as a correction. With Qwen3 30B, the model behind Jarvis, it surfaced four problems:

1. The lesson's sample corrections, written in the reply format, were copied onto correct sentences: 10 of 10 correct sentences got a "correction". The samples are now labelled as other learners' errors, a deliberate difference from the app.
2. "Corrections" that repeat the learner's own words. The page now drops any correction found word for word in her message (`withoutEchoes`).
3. Reply shapes the app's parser did not expect: a repeated line, a second correction, a stray ✔, and reasons in brackets mid-sentence. All are now parsed, each with a test.
4. A stalled model call that hung for two minutes in 2 of 20 requests. The Worker now gives up on a silent start after 25 s (with one retry) and on a silent stream after 30 s.

Even with those fixes, Qwen3 showed a wrong form as the correction in 6 of 20 turns ("Está morena", "hoy soy de buen humor"). Gemma 4 26B scored 20 of 20 on the same test, run against the shipping configuration. Mistral Small 3.1 ignored the ✔ protocol and invented corrections ("porque" to "ya que"). DeepSeek V4.1 Flash is not on the Workers Free plan. Gemma 4 thinks before answering by default, and its first test produced empty replies because the token budget went on reasoning; the Worker turns that off with `chat_template_kwargs.enable_thinking: false`. A tutor turn costs about 13 neurons, against about 9 for Qwen3, well inside the free allocation.

**Alternatives.** A Flutter web build of Olympus: blocked by its mobile-only plugins, and the source is not on this machine (it was recovered from the build cache for reference). Recorded videos of the apps, which show the app exactly but cannot be used. An Android emulator in the browser, which is heavy and would ship the full apps.

**Trade-offs.** The screens are recreations, so they can drift from the apps; each page says what is ported and what is left out. Only one Spanish Tutor topic is included. Olympus's camera rep counter, voice logging, GPS runs and barcode scanning are described, not shown. The live tutor needs a connection and shares the daily free allowance with Jarvis. It corrects at most two errors per turn, as the app asks, so it can leave one uncorrected.

**Check it yourself.** `node site/tests/la-pina.test.mjs`, `spanish-tutor.test.mjs` and `olympus.test.mjs` (all three run in CI). With `wrangler dev` running from `site/`, `node site/tests/tutor-eval.mjs http://127.0.0.1:8787` prints each reply and the score.

## Known limits and what comes next

- **Old version at the root.** `index.html`, `index-v1.html`, `build.py` and `dist/` at the repository root are the first single-page site, kept for reference (the README says so). Next: move them into an `archive/` folder.
- **Thin automated checks.** CI (`.github/workflows/site.yml`) runs the unit tests in `site/tests/` (chess rules, Jarvis server logic, the three app engines) and the build with its reference and CSP checks. The two model evaluations need a running site and Workers AI, so they run by hand. There is no browser test yet. Next: a smoke test that loads each page and fails on console errors. Deploys are manual.
- **Numbers repeated across files** (decision 4).
- **Lifetime fit reads high.** `fitTau()` in `research.js` takes the mean time after 6 µs, which is correct for a single exponential but here still includes the 2 µs triplet rise and the uniform dark counts. Re-running the same model in Python with 60,000 events gives about 3.8 µs for an input of 3.5 µs, and about 71 µs for 68 µs. The page now states the bias next to the readout. Next: fit the full rise-and-decay model, or start the window later and subtract the dark-count level.
- **Fewer facts for imported games and explore lines.** Pins and mate in one are not computed in the browser (decision 7).
- **Explore mode needs a pointer.** No keyboard access to squares yet (decision 7b).
- **Public Jarvis knows only page text.** Facts drawn by JavaScript are invisible to it; citations are sometimes omitted; a current employer is not on the site, so it says it does not know (decision 11).
- **App demos are recreations.** They run the apps' ported logic on sample data, with one Spanish Tutor topic of 68; device features such as the camera, GPS and Health Connect are described, not shown (decision 12).
- **Browser grades are indicative.** The lite single-threaded engine grades fewer moves as blunders than full Stockfish on the same game (decision 6).

## Questions a reviewer might ask

**Why no framework?**
The site is six mostly static pages with a handful of interactive canvases, and none of it needs client-side routing or shared state. Plain HTML with one script per feature means the code in git is the code that runs, and there is nothing to upgrade. The cost is a hand-repeated header and implicit script order, which are manageable at this size.

**Why is the in-browser Stockfish single-threaded?**
Multithreaded WebAssembly shares memory through `SharedArrayBuffer`, which browsers only expose on cross-origin isolated pages: that takes the COOP and COEP headers. Under COEP, cross-origin resources like Google Fonts and three.js from cdnjs must send CORS or CORP headers or be blocked. The single-threaded lite build avoids all of that, in exchange for weaker analysis per second.

**What actually runs on Cloudflare?**
Mostly files. Cloudflare serves what `build.py` writes to `dist/`, plus the `_headers` file. The only code is `server/worker.js`, which runs for `/api/*` alone: the public Jarvis's chat and transcription, and the Spanish Tutor demo's tutor, all on Workers AI's free allocation (decisions 11 and 12). The two hostnames are custom domains, so Cloudflare manages their DNS records and certificates, which is why the nameservers moved from Porkbun. Porkbun hosting was paid only and GitHub Pages needed a public repo or a paid plan at the time.

**What do your security headers protect against, and what is missing?**
`nosniff` stops content-type guessing, `X-Frame-Options: DENY` blocks clickjacking through iframes, the referrer policy sends other sites only the origin, and the permissions policy turns off camera, microphone and location for every script. The Content-Security-Policy is the main defence: an allow-list of where scripts, styles, fonts and network requests may come from, so an injected script does not run. Getting there meant moving three inline scripts into files and allowing WebAssembly compilation for Stockfish; the build now fails if inline script ever comes back.

**How do you know the physics visuals are right?**
Each one is computed from a formula printed on the page: the Gaussian waist w₀ = λ/(π·NA), the Rayleigh range z_R = π·w₀²·n/λ, excitation proportional to intensity to the power n. At NA 0.5 and 800 nm you can check the readout by hand: 0.51 µm and 1.35 µm. What is not computed, like the tumour dose model and the mouse zoom, is labelled as an illustration on the page.

**What happens if three.js fails to load, or JavaScript is off?**
The HTML already holds the final state of every result: the agent's tool calls, the fitted chart, the tables. `createBench` checks for `THREE` and for a working WebGL renderer and, if either is missing, draws the 2D readout and returns an object whose methods do nothing, so nothing else on the page breaks.

**How did you keep the animations from slowing the page?**
Loops stop when their canvas is off screen or the tab is hidden, canvas resolution is capped at 2x, and the costly per-pixel heatmap is cached and only rebuilt when the slider or window size changes. Chapter changes use an `IntersectionObserver` instead of reading layout on every scroll event. The engine runs in a Web Worker, so analysis never blocks the page.
