# sergioadan.dev

Source of my portfolio site, live at [sergioadan.dev](https://sergioadan.dev): measured results, interactive physics, an in-browser chess analyser, a public Jarvis and browser demos of three Android apps, with no framework and no bundler.

| Page | What it shows |
|---|---|
| Home | Projects, the system behind my local assistant, an engineering log, and the AI-engineering roles mapped to evidence |
| `work/lab-agent.html` | An AI agent running a simulated photophysics experiment through an MCP server ([photonics-lab-mcp](https://github.com/sadanbermudez/photonics-lab-mcp)), and a live run any visitor can start, graded against a hidden sample with a public score (`lab-sim.js`, `lab-live.js`, `server/lab-agent.js`, `POST /api/lab`) |
| `work/llama-cpp-stall.html` | A latency investigation in llama.cpp, step by step, with every measured value |
| `work/moe.html`, `moe.js` | One token through a 284B mixture-of-experts model on a laptop: the measured engine builds, a real-time race of the tokens it wrote, and the drive-bound arithmetic |
| `work/chess.html` | A reviewed game replayed with engine-checked facts, PGN import and Stockfish running in the browser ([jarvis-chess](https://github.com/sadanbermudez/jarvis-chess)) |
| `work/two-photon.html` | One- versus two-photon excitation: beam waist, focal volume, penetration, a photodynamic-therapy illustration |
| `work/research.html` | My PhD and postdoc research: singlet oxygen detection, hollow-core fibres, photon counting |
| `about.html` | My story: six cities, four fields, chess, and life away from the desk |
| `jarvis.html` | Talk to a public Jarvis by text or voice: Gemma 4 on Workers AI's free tier, answers cited from this site, a voice chosen per device (Kokoro in the browser where it is fast, otherwise the device voice or MeloTTS) |
| `argus.html` | Argus, my agent system built on Odysseus (AGPL-3.0, credited): a recreation of the hub with a guided tour on sample data, what is mine and what is Odysseus, and the credits |
| `apps/la-pina/` | La Piña Investments (Kotlin, Android): the trading method's rules engine ported to JavaScript, on simulated markets |
| `apps/spanish-tutor/` | Spanish Tutor (Kotlin, Android): one real topic of the course, the ported search and grading, and the AI tutor live through `/api/tutor` |
| `apps/olympus/` | Olympus (Flutter, Android): training, nutrition and running screens with the app's formulas ported, on sample data |

## How it is built and why

**[DECISIONS.md](DECISIONS.md)** records each design decision (static pages, the build script and security headers, Cloudflare hosting, three.js, Stockfish in a Web Worker, how every number on the site is sourced, the public Jarvis, the app demos, the Argus page), with alternatives, trade-offs and a way to check each one, plus the known limits.

## Build and deploy

```
cd site
python build.py          # writes dist/ and the _headers file
wrangler deploy          # static-assets Worker, see site/wrangler.jsonc
```

The live site is built from `site/` only. `site/server/` is the small Worker behind `/api/chat`, `/api/fit`, `/api/tutor`, `/api/transcribe` and `/api/speak`. Tests: `node site/tests/<name>.test.mjs` for each part, and `node site/tests/smoke.mjs` loads every built page in Chromium on a laptop and a phone (needs Playwright); `site/tests/jarvis-eval.mjs`, `site/tests/fit-eval.mjs` and `site/tests/tutor-eval.mjs` grade the live models against a running site. The CV PDFs in `site/data/` are printed from `site/cv.html` by `python tools/make_cv_pdfs.py`. The `index.html`, `index-v1.html`, `build.py` and `dist/` at the repository root are the first, single-page version, kept for reference.

Built with AI assistance (Claude Code), directed and reviewed by Sergio Adan Bermudez.
