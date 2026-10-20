"""Build the deployable site in site/dist/. index.html is written as a fragment for the Claude
artifact preview (which adds its own skeleton), so it is wrapped into a full page here; the
stylesheets, scripts and other pages are already complete and are copied as they are.
The build fails if any page references a local file that is not in dist/."""
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
for f in [*here.glob("*.js"), *here.glob("*.css"), *here.glob("*.svg"), here / "404.html"]:
    shutil.copy2(f, dist / f.name)
for f in (here / "work").glob("*.html"):
    shutil.copy2(f, dist / "work" / f.name)
# Response headers for every path (Cloudflare static assets read _headers)
(dist / "_headers").write_text(
    "/*\n"
    "  X-Content-Type-Options: nosniff\n"
    "  Referrer-Policy: strict-origin-when-cross-origin\n"
    "  X-Frame-Options: DENY\n"
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n", encoding="utf-8")

# Every local src/href in every page must resolve to a file in dist/ (pages may be linked without .html).
missing = []
for html in dist.rglob("*.html"):
    for ref in re.findall(r'(?:src|href)="([^"#?]*)', html.read_text(encoding="utf-8")):
        if not ref or re.match(r"(https?:|mailto:|data:|//)", ref):
            continue
        target = (dist / ref.lstrip("/") if ref.startswith("/") else html.parent / ref).resolve()
        if not (target.is_file() or target.with_suffix(".html").is_file() or (target / "index.html").is_file()):
            missing.append(f"{html.relative_to(dist)} -> {ref}")
if missing:
    sys.exit("missing files:\n  " + "\n  ".join(missing))
print("built", sorted(str(p.relative_to(dist)) for p in dist.rglob("*") if p.is_file()))
