# sergioadan.dev

Source of my portfolio site, live at [sergioadan.dev](https://sergioadan.dev): measured results, interactive physics, an in-browser chess analyser, a public Jarvis and browser demos of three Android apps, with no framework and no bundler.

| Page | What it shows |
|---|---|
| Home | Projects, the system behind my local assistant, an engineering log, and the AI-engineering roles mapped to evidence |
| `work/lab-agent.html` | An AI agent running a simulated photophysics experiment through an MCP server ([photonics-lab-mcp](https://github.com/sadanbermudez/photonics-lab-mcp)) |
| `work/llama-cpp-stall.html` | A latency investigation in llama.cpp, step by step, with every measured value |
| `work/chess.html` | A reviewed game replayed with engine-checked facts, PGN import and Stockfish running in the browser ([jarvis-chess](https://github.com/sadanbermudez/jarvis-chess)) |
| `work/two-photon.html` | One- versus two-photon excitation: beam waist, focal volume, penetration, a photodynamic-therapy illustration |
| `work/research.html` | My PhD and postdoc research: singlet oxygen detection, hollow-core fibres, photon counting |
| `about.html` | My story: six cities, four fields, chess, and life away from the desk |
| `jarvis.html` | Talk to a public Jarvis by text or voice: Qwen3 on Workers AI's free tier, answers cited from this site, Kokoro voice in the browser |
| `apps/la-pina/` | La Piña Investments (Kotlin, Android): the trading method's rules engine ported to JavaScript, on simulated markets |
| `apps/spanish-tutor/` | Spanish Tutor (Kotlin, Android): one real topic of the course, the ported search and grading, and the AI tutor live through `/api/tutor` |
| `apps/olympus/` | Olympus (Flutter, Android): training, nutrition and running screens with the app's formulas ported, on sample data |

## How it is built and why

**[DECISIONS.md](DECISIONS.md)** records each design decision (static pages, the build script and security headers, Cloudflare hosting, three.js, Stockfish in a Web Worker, how every number on the site is sourced, the public Jarvis, the app demos), with alternatives, trade-offs and a way to check each one, plus the known limits.

## Build and deploy

```
cd site
python build.py          # writes dist/ and the _headers file
wrangler deploy          # static-assets Worker, see site/wrangler.jsonc
```

The live site is built from `site/` only. `site/server/` is the small Worker behind `/api/chat`, `/api/tutor` and `/api/transcribe`. Tests: `node site/tests/<name>.test.mjs` for each part; `site/tests/jarvis-eval.mjs` and `site/tests/tutor-eval.mjs` grade the live models against a running site. The `index.html`, `index-v1.html`, `build.py` and `dist/` at the repository root are the first, single-page version, kept for reference.

Built with AI assistance (Claude Code), directed and reviewed by Sergio Adan Bermudez.
