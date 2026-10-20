"""Wrap index.html (written for the Claude artifact preview, which adds its own skeleton)
into a standalone page for static hosting such as GitHub Pages. Output: dist/index.html"""
from pathlib import Path

src = Path(__file__).with_name("index.html").read_text(encoding="utf-8")
head_end = src.index("</style>") + len("</style>")
page = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
    + src[:head_end].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
    + "\n</head>\n<body>\n" + src[head_end:].lstrip() + "\n</body>\n</html>\n"
)
Path(__file__).with_name("dist").joinpath("index.html").write_text(page, encoding="utf-8")
print("wrote dist/index.html", len(page), "bytes")
