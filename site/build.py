"""Build the deployable site in site/dist/. index.html is written as a fragment for the Claude
artifact preview (which adds its own skeleton), so it is wrapped into a full page here; the
stylesheets, scripts and other pages are already complete and are copied as they are.
The build fails if any page references a local file that is not in dist/, or contains anything
the Content-Security-Policy below would block."""
import re
import shutil
import sys
from pathlib import Path

here = Path(__file__).parent
dist = here / "dist"
shutil.rmtree(dist, ignore_errors=True)
(dist / "work").mkdir(parents=True)
for folder in ("data", "engine", "vendor"):             # game data, self-hosted Stockfish WASM and chess.js, with licences
    shutil.copytree(here / folder, dist / folder)

src = (here / "index.html").read_text(encoding="utf-8")
last_link = '<link rel="stylesheet" href="immersive.css">'      # the head ends after the last stylesheet
head_end = src.index(last_link) + len(last_link)
page = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
        + src[:head_end].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
        + "\n</head>\n<body>\n" + src[head_end:].lstrip() + "</body>\n</html>\n")
(dist / "index.html").write_text(page, encoding="utf-8")
pages = [f for f in here.glob("*.html") if f.name != "index.html"]       # 404.html, about.html, ...
for f in [*here.glob("*.js"), *here.glob("*.css"), *here.glob("*.svg"), *pages]:
    shutil.copy2(f, dist / f.name)
for f in (here / "work").glob("*.html"):
    shutil.copy2(f, dist / "work" / f.name)
# Content-Security-Policy: every source the site loads from, and nothing else.
#   scripts: own files, three.js from cdnjs (also pinned by SRI), WebAssembly for Stockfish
#   styles:  own files and Google Fonts; style="" attributes allowed, <style> blocks are not
#   connect: own origin (the engine loads its .wasm), Lichess and Chess.com game APIs
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com 'wasm-unsafe-eval'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self' https://lichess.org https://api.chess.com",
    "img-src 'self' data:",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
])
# Response headers for every path (Cloudflare static assets read _headers)
(dist / "_headers").write_text(
    "/*\n"
    f"  Content-Security-Policy: {CSP}\n"
    "  Strict-Transport-Security: max-age=31536000; includeSubDomains\n"
    "  Cross-Origin-Opener-Policy: same-origin\n"
    "  X-Content-Type-Options: nosniff\n"
    "  Referrer-Policy: strict-origin-when-cross-origin\n"
    "  X-Frame-Options: DENY\n"
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n", encoding="utf-8")

# Every local src/href in every page must resolve to a file in dist/ (pages may be linked without .html),
# and no page may contain what the CSP blocks: inline <script>, <style> blocks, on*="" handlers, javascript: URLs.
BLOCKED = ((r"<script(?![^>]*\bsrc=)[^>]*>", "inline script"), (r"<style[\s>]", "style block"),
           (r"\son[a-z]+\s*=\s*[\"']", "inline event handler"), (r"javascript:", "javascript: URL"))
missing = []
for html in dist.rglob("*.html"):
    text = html.read_text(encoding="utf-8")
    for pattern, what in BLOCKED:
        if re.search(pattern, text, re.I):
            missing.append(f"{html.relative_to(dist)} -> {what} (blocked by the CSP)")
    for ref in re.findall(r'(?:src|href)="([^"#?]*)', text):
        if not ref or re.match(r"(https?:|mailto:|data:|//)", ref):
            continue
        target = (dist / ref.lstrip("/") if ref.startswith("/") else html.parent / ref).resolve()
        if not (target.is_file() or target.with_suffix(".html").is_file() or (target / "index.html").is_file()):
            missing.append(f"{html.relative_to(dist)} -> {ref}")
if missing:
    sys.exit("build check failed:\n  " + "\n  ".join(missing))
print("built", sorted(str(p.relative_to(dist)) for p in dist.rglob("*") if p.is_file()))
