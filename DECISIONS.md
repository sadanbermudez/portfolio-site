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
 vendor/  chess.js + BSD-2-Clause licence      -->    copies tree     -->  vendor/
                                                      writes          -->  _headers  (4 security headers)
                                                                                |
                                                         wrangler deploy  (site/wrangler.jsonc)
                                                                                v
                                   Cloudflare Worker "sergioadan": static assets only, no Worker code
                                                                                |
                                   sergioadan.dev and www.sergioadan.dev  (custom domains)
                                   (workers_dev: false, so no second hostname)

 Pages and the scripts each one loads  (every page: site.css, immersive.css, Google Fonts)
 index.html ................ three.js r128 (cdnjs), bench.js, hero.js, lab.js, inline script
 work/lab-agent.html ....... three.js r128, bench.js, lab.js, scrolly.js, inline script
 work/llama-cpp-stall.html . scrolly.js, engine.js
 work/chess.html ........... data/chess-game.js, chess-core.js, chess.js, three.js r128,
                             chess3d.js, analyse.js, inline script
                               on "Analyse": Web Worker engine/stockfish-19-lite-single.js (+ .wasm),
                               import() of vendor/chess.js, fetch() from lichess.org
 work/two-photon.html ...... photon.js
 work/research.html ........ research.js
```

The repo root also holds an earlier single-page version of the site (`index.html`, `index-v1.html`, `build.py`, `dist/index.html`). The root `README.md` describes that version. The live site is built from `site/` only.

## Decisions

### 1. A static site with no framework and no bundler

**Context.** The site is six pages of text, tables and interactive canvases, written by one person and served from a static host. Nothing on it needs a server, a login or a database.

**Decision.** Plain HTML pages, two shared stylesheets (`site.css` for tokens, layout and components; `immersive.css` for the scrollytelling, chess and physics pages) and one script per feature. Each script is a function that runs once and exposes at most one global, apart from `bench.js`, which also exposes its data as `window.BENCH_RUN`: `window.createBench` (bench.js), `window.scrollyChapters` (scrolly.js), `window.ChessCore` (chess-core.js), `window.ChessViewer` (chess.js), `window.Chess3D` (chess3d.js). Dependencies are expressed by the order of the `<script>` tags: on `work/chess.html`, `chess-core.js` and `chess.js` load before `chess3d.js`, which needs both.

**Why.** With no build toolchain, the file in git is the file the browser runs (the home page wrapper in decision 2 is the one exception). There is nothing to install and no dependency tree to keep updated, and a reviewer can read any script in one sitting; the largest one, `research.js`, is 24,093 bytes. Script order plus one global per file is the browser's oldest module system. It is enough here because the dependency graph is small and has no cycles.

**Alternatives.** A component framework with a bundler, which would share the header and footer across pages and add type checks. A static site generator, which would template the six page headers instead of repeating them.

**Trade-offs.** The header is written out by hand on every page. Globals could collide if the site grew, and a wrong script order fails at runtime, not at build time. Nothing is minified.

**Check it yourself.** `grep -n "^window\.[A-Za-z0-9_]* = " site/*.js` lists every global the site defines. Open `site/work/chess.html` and read the script tags at the bottom in order.

### 2. One small Python script builds the deploy folder and writes the security headers

**Context.** `site/index.html` is written as a fragment, without `<html>`, `<head>` or `<body>`, because it is previewed in Claude's artifact viewer, which adds its own skeleton (docstring of `site/build.py`). A static host needs a full document. The work pages are already full documents.

**Decision.** `site/build.py` uses only the Python standard library. It deletes `dist/`, copies the `data/`, `engine/` and `vendor/` folders (the last two with their licence files), copies every top-level script and stylesheet and `404.html`, and copies every `work/*.html`. It wraps the home page: it adds the doctype, `<html lang="en">`, the charset and a viewport meta with `viewport-fit=cover`; finds the end of the head by locating the last stylesheet link (`immersive.css`); drops the preview-only `claude:viewport-fit-sides` meta; and puts the rest inside `<body>`. It writes `dist/_headers`, and finally checks every local `src` and `href` in every built page and fails the build if one does not resolve to a file in `dist/`:

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Why.** One source file serves both the preview and the live site. Deleting `dist/` first means a file removed from `site/` can never linger in a deploy. `src.index(last_link)` raises an error if the marker is missing, so a broken head stops the build instead of shipping a malformed page. Each header closes one specific door:

- `nosniff` makes the browser trust the declared content type instead of guessing, so a file served as text cannot be run as a script.
- `strict-origin-when-cross-origin` means other sites the pages link or fetch from (Lichess, GitHub, LinkedIn) see only `https://sergioadan.dev`, not the full path, and nothing at all over plain HTTP.
- `X-Frame-Options: DENY` stops any other site from loading these pages in an iframe, which is the setup for clickjacking.
- The `Permissions-Policy` line means no script on the site, first-party or third-party, can even ask for the camera, microphone or location.

**Alternatives.** Write `index.html` as a full document and stop previewing it as an artifact. Glob for `*.js` instead of naming the files.

**Trade-offs.** The head detection depends on one literal string. The reference check reads attributes with a regular expression, so it sees `src` and `href` in markup but not URLs built in JavaScript (the engine worker path in `analyse.js`, for example). There is no Content-Security-Policy (see "Known limits").

**Check it yourself.** From `site/`, run `python build.py`; it prints every file it wrote. Then `head -12 dist/index.html` shows the generated head. On the live site, `curl -sI https://sergioadan.dev/ | grep -iE "x-frame|nosniff|referrer|permissions"` shows whether the headers are served.

### 3. Cloudflare static-assets Worker on the custom domain

**Context.** The domain `sergioadan.dev` was bought at Porkbun on 20 October 2026. The GitHub repo was private at the time. The project notes record a hosting check on the same day: Porkbun static hosting is paid only; GitHub Pages needs a public repo or a paid GitHub plan; Cloudflare Pages deploys a private repo for free. When the deploy was attempted, `wrangler pages project create` delegated to Workers, so the site went out as a static-assets Worker, which `wrangler.jsonc` describes as "Cloudflare's successor to Pages".

**Decision.** `site/wrangler.jsonc`: a Worker named `sergioadan` whose `assets.directory` is `./dist`, with `not_found_handling: "404-page"`, `workers_dev: true`, and two routes, `sergioadan.dev` and `www.sergioadan.dev`, each with `custom_domain: true`. The domain's nameservers were moved from Porkbun to Cloudflare. Deploying is two commands from `site/`: `python build.py`, then `wrangler deploy`.

**Why.** A static-assets Worker serves files straight from Cloudflare's network and runs no code, so there is nothing to patch, scale or monitor beyond the files themselves. Marking a route as a custom domain lets Cloudflare create the DNS record and the TLS certificate for that hostname. That only works when Cloudflare runs the domain's DNS, which is why the nameservers moved. The notes record what was verified on deploy: every page returned 200 on the workers.dev hostname, both custom domains returned 200, `.html` URLs are redirected (307) to clean URLs and relative asset paths still resolve, and unknown paths return 404.

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

**Decision.** `analyse.js`, function `startEngine()`, creates `new Worker('../engine/stockfish-19-lite-single.js')` and talks to it in UCI, the text protocol desktop chess engines use: `uci`, wait for `uciok`, `isready`, wait for `readyok`. `search(fen, ms)` sends `position fen ...` and `go movetime ms`, keeps the last `info ... score cp|mate ... pv` line and resolves when `bestmove` arrives. Scores are flipped when Black is to move, because the engine reports them from the side to move. The engine starts on the first "Analyse" click, not on page load. The files sit in `site/engine/` with `COPYING.txt` (GPLv3); the loader's header names Stockfish.js 19 by Chess.com, LLC.

**Why.**

- **Web Worker.** The search runs on a separate thread, so the board, scrolling and buttons stay responsive while the engine thinks.
- **Single-threaded.** A multithreaded WebAssembly build shares memory between threads through `SharedArrayBuffer`. Browsers only allow `SharedArrayBuffer` on pages that are cross-origin isolated, which takes two response headers, `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`). Under that embedder policy, every cross-origin resource the page loads, including Google Fonts and three.js from cdnjs, must opt in through CORS or CORP headers or be blocked. The single-threaded build needs none of this, and `_headers` sets neither header. The loader file does not contain the string `SharedArrayBuffer` at all.
- **Lite.** The lite build ships a smaller network: the `.wasm` file is 1,787,571 bytes.
- **Self-hosted.** A browser only starts a Worker from a script on the page's own origin, so the engine has to be served from the site. Shipping the files in the repo also ships the GPL licence beside the binary, and `build.py` copies both.
- **Started on demand.** Visitors who only replay the reviewed game never download the engine.

**Alternatives.** The multithreaded build with cross-origin isolation headers. The full-size network. Analysis on a server, such as the jarvis-chess MCP server that produced the reviewed game, which is not exposed publicly.

**Trade-offs.** One thread and a smaller network give weaker analysis per second than desktop Stockfish. The engine runs for a fixed time per position (150, 400 or 1,000 ms), not to a fixed depth, so results vary with the visitor's hardware. Evaluations are clamped to ±1,500 centipawns for the graph.

**Check it yourself.** `grep -c SharedArrayBuffer site/engine/stockfish-19-lite-single.js` prints 0. Analyse a game with DevTools open: the Sources panel lists the worker thread, and the main thread stays idle.

### 7. chess.js vendored for PGN; a small rules module for the facts

**Context.** Imported games have to be parsed and replayed legally, and the board's "verified facts" and the 3D "lines of force" need to know what attacks what.

**Decision.** `site/vendor/chess.js` (an ES module, with its BSD-2-Clause licence in `chess.js.LICENSE.txt`; version 1.4.0 according to the project notes) is loaded only when needed, with `await import('../vendor/chess.js')` inside `run()` in `analyse.js`. It reads the PGN, lists the moves, produces each position's FEN and detects game over. The facts come from `chess-core.js` (`window.ChessCore`): `attacks()` lists every square each piece attacks, and `facts()` derives hanging pieces (attacked, no defender), pieces attacked by a cheaper piece, and material. `chess.js` (the viewer) uses `ChessCore.facts()` when a game has no server review, and `chess3d.js` draws its beams and red rings from the same functions.

**Why.** PGN parsing is fiddly; the vendored file includes a generated parser. A pinned copy in the repo is same-origin and cannot change unexpectedly, and the dynamic import keeps its 107,052 bytes off the first page load. The facts module is 65 lines and computes only what the page shows, using the same rule as the jarvis-chess Python server. The notes record that its attack map agrees with the Python server on all 74 positions of the reviewed game (73 moves plus the start).

**Alternatives.** Load chess.js from a CDN. Run every game through the jarvis-chess server so imported games get the full set of facts.

**Trade-offs.** "Hanging" here means attacked with zero defenders; it ignores pins, x-rays and whether the capture actually wins anything. `facts()` always returns empty lists for pinned pieces and mate in one, so games analysed in the browser show fewer kinds of fact than the server-reviewed game. Updating chess.js is a manual copy.

**Check it yourself.** `grep -n "pinned_pieces" site/chess-core.js` shows the empty lists. `grep -n "import(" site/analyse.js` shows the on-demand load.

### 8. Three kinds of numbers, each labelled for what it is

**Context.** The site's claim is "I measure every change". A reader who catches one invented number will doubt every other one.

**Decision.** Every number on the site belongs to one of three kinds, and the page says which.

- **Measured.** The engine case study: `engine.js` says in its header "Every bar is a measured value from 19 to 20 October 2026", and its `STEPS` array holds those values. The home page's memory-path animation moves its dots in 14 s (before) and 1 s (after), and 7,738 ms divided by 553 ms is 14.0, so the dots really do move at the measured ratio. 880 MB in 7.738 s is the 114 MB/s on the page. The lab-agent replay in `lab.js` and the bench's `BENCH_RUN` are the recorded tool calls and peak counts.
- **Computed from formulas, in the browser.** `photon.js`, function `beam()`: Gaussian beam waist w₀ = λ/(π·NA) and Rayleigh range z_R = π·w₀²·n/λ with n = 1.33. The side view integrates intensity to the power n (1 or 2) along the line of sight, giving w^(1−2n)·exp(−2n·x²/w²) (header comment). The per-plane plot is flat for one photon and 1/(1 + z²/z_R²), which is proportional to 1/w², for two photons, so its full width at half maximum is 2·z_R. Penetration is exp(−n·z/δ) with δ from the sources cited on the page. In `research.js`, anti-resonance wavelengths are λ_m = 2t·√(n_glass² − n_core²)/m; filling the core with water scales them by 0.55, against 0.556 in the thesis. The fibre mode is J₀², from the Abramowitz and Stegun polynomial. The photon-counting Monte Carlo samples each arrival time as a 2 µs triplet delay plus the singlet-oxygen lifetime, with 3% dark counts and 3% detector efficiency.
- **Illustrative, and labelled so.** The photodynamic therapy dose model ("illustrative model", "It shows the principle, not a dosimetry calculation", focus drawn at 0.12 mm for visibility). The powers-of-ten zoom ("illustration of photodynamic therapy in general; my thesis work was in solution, not in animals"). The fibre drawing ("schematic"; membrane thickness "a free parameter here"). The 3D bench ("The bench is a simulator"); its spectrometer trace is a drawn Gaussian with random noise on a fixed baseline, and only the peak heights are recorded values.

**Why.** Labels let a reader check the formulas instead of trusting them, and keep illustrations from passing as data. Computing live, rather than shipping images, means the slider shows the formula responding to the input.

**Alternatives.** Pre-rendered images or video of the simulations. Tables of precomputed values.

**Trade-offs.** The paraxial Gaussian model is only approximate at high numerical aperture; the page says so and the slider goes up to NA 1.0. The live "fitted lifetime" reads high (see "Known limits").

**Check it yourself.** On `work/two-photon.html` at NA 0.50, the formulas give w₀ 0.25 µm and z_R 0.68 µm at 400 nm, and w₀ 0.51 µm, z_R 1.35 µm and a two-photon width of 2.71 µm at 800 nm. Compute them by hand from the two formulas above and compare with the readouts under the canvases.

### 9. Scroll-driven chapters with IntersectionObserver, and drawing only what is on screen

**Context.** The lab-agent and engine pages tell their story in chapters as the reader scrolls, and several pages run animation loops.

**Decision.** `scrolly.js`, function `scrollyChapters(nodes, onEnter)`, watches each chapter with an `IntersectionObserver` whose `rootMargin` is `-45% 0px -45% 0px`. That shrinks the viewport, for this purpose, to a band 10% tall across the middle of the screen; the chapter that enters the band is marked "on" and the callback runs. On the lab-agent page the callback flies the 3D camera and switches the laser; on the engine page (`engine.js`) it redraws the time-budget panel. The research page's zoom is different: `zoomProgress()` reads the section's position every frame, because the zoom needs a continuous value across six scenes, not a switch between chapters.

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

For small screens: breakpoints at 520, 640, 760, 900 and 980 px. Side gutters are `max(16px, env(safe-area-inset-left))`, with `viewport-fit=cover` for notched phones. Sticky stages use `svh` units, so the mobile address bar does not cause a jump. Tables sit in `.table-scroll` and diagrams in `.diagram`, both with `overflow-x: auto` and a minimum width, so they scroll inside their panel instead of widening the page. The spectrometer readout is hidden below 760 px. On narrow screens the engine page pins its time-budget panel above the steps (`order: -1`). The 3D canvases set `touch-action: pan-y`, so a vertical swipe scrolls the page while a horizontal drag turns the view.

**Why.** Motion can cause discomfort for some readers, and the operating system setting is the signal they have already given. On phones, the one layout failure readers notice at once is sideways scrolling, so wide content is contained in its own scroll box.

**Alternatives.** A single "animations off" toggle on the site. A separate mobile layout.

**Trade-offs.** In reduced-motion mode no animation loop runs, so every control that changes a simulation has to finish and redraw it in its own handler (the treatment switch in `photon.js` and the solvent switch in `research.js` do). The notes record browser checks at 1,037 and 1,440 px wide for the v5 design and at phone width for the roles section, with no horizontal overflow; there is no automated layout test.

**Check it yourself.** DevTools, Rendering panel: set "Emulate CSS media feature prefers-reduced-motion" to "reduce" and reload the home page. Then use device mode at 375 px wide and confirm the page never scrolls sideways.

## Known limits and what comes next

- **Old version at the root.** `index.html`, `index-v1.html`, `build.py` and `dist/` at the repository root are the first single-page site, kept for reference (the README says so). Next: move them into an `archive/` folder.
- **No Content-Security-Policy.** A CSP would have to allow cdnjs and Google Fonts, `connect-src` to lichess.org, the inline scripts on three pages (by hash), Workers from the site's own origin, and WebAssembly compilation (`'wasm-unsafe-eval'`).
- **Thin automated checks.** CI (`.github/workflows/site.yml`) runs the rules-module tests in `site/tests/` and the build with its reference check. There is no browser test yet. Next: a smoke test that loads each page and fails on console errors. Deploys are manual.
- **Numbers repeated across files** (decision 4).
- **Lifetime fit reads high.** `fitTau()` in `research.js` takes the mean time after 6 µs, which is correct for a single exponential but here still includes the 2 µs triplet rise and the uniform dark counts. Re-running the same model in Python with 60,000 events gives about 3.8 µs for an input of 3.5 µs, and about 71 µs for 68 µs. The page now states the bias next to the readout. Next: fit the full rise-and-decay model, or start the window later and subtract the dark-count level.
- **Fewer facts for imported games.** Pins and mate in one are not computed in the browser (decision 7).

## Questions a reviewer might ask

**Why no framework?**
The site is six mostly static pages with a handful of interactive canvases, and none of it needs client-side routing or shared state. Plain HTML with one script per feature means the code in git is the code that runs, and there is nothing to upgrade. The cost is a hand-repeated header and implicit script order, which are manageable at this size.

**Why is the in-browser Stockfish single-threaded?**
Multithreaded WebAssembly shares memory through `SharedArrayBuffer`, which browsers only expose on cross-origin isolated pages: that takes the COOP and COEP headers. Under COEP, cross-origin resources like Google Fonts and three.js from cdnjs must send CORS or CORP headers or be blocked. The single-threaded lite build avoids all of that, in exchange for weaker analysis per second.

**What actually runs on Cloudflare?**
No code. It is a Worker with only static assets: Cloudflare serves the files `build.py` writes to `dist/`, plus the `_headers` file. The two hostnames are custom domains, so Cloudflare manages their DNS records and certificates, which is why the nameservers moved from Porkbun. Porkbun hosting was paid only and GitHub Pages needed a public repo or a paid plan at the time.

**What do your security headers protect against, and what is missing?**
`nosniff` stops content-type guessing, `X-Frame-Options: DENY` blocks clickjacking through iframes, the referrer policy sends other sites only the origin, and the permissions policy turns off camera, microphone and location for every script. The gap is a Content-Security-Policy. It is not hard in principle, but it has to account for cdnjs, Google Fonts, Lichess, the inline scripts and WebAssembly.

**How do you know the physics visuals are right?**
Each one is computed from a formula printed on the page: the Gaussian waist w₀ = λ/(π·NA), the Rayleigh range z_R = π·w₀²·n/λ, excitation proportional to intensity to the power n. At NA 0.5 and 800 nm you can check the readout by hand: 0.51 µm and 1.35 µm. What is not computed, like the tumour dose model and the mouse zoom, is labelled as an illustration on the page.

**What happens if three.js fails to load, or JavaScript is off?**
The HTML already holds the final state of every result: the agent's tool calls, the fitted chart, the tables. `createBench` checks for `THREE` and for a working WebGL renderer and, if either is missing, draws the 2D readout and returns an object whose methods do nothing, so nothing else on the page breaks.

**How did you keep the animations from slowing the page?**
Loops stop when their canvas is off screen or the tab is hidden, canvas resolution is capped at 2x, and the costly per-pixel heatmap is cached and only rebuilt when the slider or window size changes. Chapter changes use an `IntersectionObserver` instead of reading layout on every scroll event. The engine runs in a Web Worker, so analysis never blocks the page.
