"""Build the deployable site in site/dist/. index.html is written as a fragment for the Claude
artifact preview (which adds its own skeleton), so it is wrapped into a full page here; the
stylesheets, scripts and other pages are already complete and are copied as they are.
The build fails if any page references a local file that is not in dist/, or contains anything
the Content-Security-Policy below would block."""
import json
import re
import shutil
import sys
from pathlib import Path

here = Path(__file__).parent
dist = here / "dist"
shutil.rmtree(dist, ignore_errors=True)
(dist / "work").mkdir(parents=True)
for folder in ("data", "engine", "vendor", "apps"):     # game data, Stockfish and chess.js, app demos, with licences
    if (here / folder).is_dir():
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
#   connect: own origin (engines load their .wasm; Jarvis's /api), Lichess and Chess.com game APIs,
#            and Hugging Face for the Kokoro voice model, which the browser downloads as data
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com 'wasm-unsafe-eval'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self' https://lichess.org https://api.chess.com https://huggingface.co https://*.hf.co",
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
    "  Permissions-Policy: camera=(), microphone=(self), geolocation=()\n"   # microphone: Jarvis, this site only
    # Cross-origin isolation for the Jarvis page and its voice worker only: it unlocks SharedArrayBuffer, so the
    # in-browser voice runs on several threads. Pages that load three.js from cdnjs are left as they are.
    + "".join(f"{path}\n  Cross-Origin-Embedder-Policy: credentialless\n" for path in ("/jarvis", "/jarvis.html", "/tts-worker.js", "/vendor/kokoro/*")),
    encoding="utf-8")

# Jarvis's knowledge: the visible text of every built page, split at headings, for the /api/chat search.
def page_chunks(html_path):
    raw = html_path.read_text(encoding="utf-8")
    title = re.sub(r"\s*·.*$", "", re.search(r"<title>(.*?)</title>", raw, re.S).group(1)).strip()
    url = "/" + html_path.relative_to(dist).as_posix().removesuffix(".html").removesuffix("index").rstrip("/")
    body = re.sub(r"<(script|style|svg|canvas|nav|header|button|select|textarea)\b.*?</\1>", " ", raw, flags=re.S | re.I)
    # A chapter label ("04 · EDINBURGH · FOUR YEARS") sits just before its heading: keep it with that heading,
    # or it would end the previous chapter's text and lend that chapter the wrong place.
    body = re.sub(r'<span class="chapter-num">(.*?)</span>\s*<h([1-3])([^>]*)>(.*?)</h\2>', r"<h\2\3>\4 (\1)</h\2>", body, flags=re.S | re.I)
    parts = re.split(r"<h[1-3][^>]*>(.*?)</h[1-3]>", body, flags=re.S | re.I)
    # Block boundaries (list items, table cells and rows, paragraphs) become " / " so separate facts stay separate:
    # a flattened legend once read "Edinburgh 4 years · PhD Wiesbaden 2 months" and lent the PhD to Wiesbaden.
    def clean(s):
        s = re.sub(r"</(li|p|div|tr|td|th|dd|dt)>", " / ", s, flags=re.I)
        s = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s)))
        return re.sub(r"(\s*/\s*)+", " / ", s).strip(" /")
    sections, heading = [], title                                                # (heading, text), headings kept as text
    for i, part in enumerate(parts):
        if i % 2:
            heading = clean(part)
            continue
        text = clean(part)
        if text or heading != title:
            sections.append((heading, (heading + ". " if heading != title else "") + text))
    out, heads, cur = [], [], ""
    def flush():
        for k in range(0, len(cur), 1100):                                       # long sections become several chunks
            piece = cur[k:k + 1100].strip()
            if piece:
                named = [h for h in heads if h != title]
                out.append({"title": f"{title}: {' · '.join(named)}" if named else title, "url": url or "/", "text": piece})
    for head, text in sections:                                                  # short sections (a hobby card, a heading) join their neighbour
        if cur and len(cur) >= 280:                                           # focused chunks: stop growing at a modest size
            flush(); heads, cur = [], ""
        heads.append(head)
        cur = (cur + " " + text).strip()
    if cur:
        flush()
    return out

from html import unescape
knowledge = [c for html in sorted(dist.rglob("*.html")) if html.name != "404.html" for c in page_chunks(html)]
(here / "server" / "knowledge.json").write_text(json.dumps(knowledge, ensure_ascii=False), encoding="utf-8")

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
