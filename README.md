# sergioadan.dev

Source of my portfolio site: a single static page, no build tools, no frameworks.

- `index.html` is the page as written (it previews in Claude's artifact viewer, which adds the HTML wrapper).
- `python build.py` wraps it into a standalone page at `dist/index.html`, the file a static host serves.
- `index-v1.html` is the first draft, kept for reference.

Fonts load from Google Fonts; there is no other external dependency and no tracking.
