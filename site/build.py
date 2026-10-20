"""Build the deployable site in site/dist/. index.html is written as a fragment for the Claude
artifact preview (which adds its own skeleton), so it is wrapped into a full page here; the
stylesheet and the work pages are already complete documents and are copied as they are."""
import shutil
from pathlib import Path

here = Path(__file__).parent
dist = here / "dist"
shutil.rmtree(dist, ignore_errors=True)
(dist / "work").mkdir(parents=True)

src = (here / "index.html").read_text(encoding="utf-8")
head_end = src.index('<link rel="stylesheet" href="site.css">') + len('<link rel="stylesheet" href="site.css">')
page = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
        + src[:head_end].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
        + "\n</head>\n<body>\n" + src[head_end:].lstrip() + "</body>\n</html>\n")
(dist / "index.html").write_text(page, encoding="utf-8")
for name in ("site.css", "hero.js", "lab.js"):
    shutil.copy2(here / name, dist / name)
for f in (here / "work").glob("*.html"):
    shutil.copy2(f, dist / "work" / f.name)
print("built", sorted(str(p.relative_to(dist)) for p in dist.rglob("*") if p.is_file()))
