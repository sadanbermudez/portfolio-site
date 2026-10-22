"""Print site/cv.html to the two CV PDFs in site/data/, using the page's own print stylesheet, so the
PDF a recruiter downloads is the same text as the page. Run after any CV edit:

    python site/build.py          # fails until the PDFs exist the first time; dist/ is written anyway
    python tools/make_cv_pdfs.py  # serves dist/, prints both versions with headless Chrome
    python site/build.py

Needs Google Chrome. Uses a throwaway Chrome profile, so it does not touch a running browser."""
import functools, http.server, os, subprocess, sys, tempfile, threading, time
from pathlib import Path

root = Path(__file__).resolve().parent.parent / "site"
chrome = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
versions = {"AI_Engineer": "", "Software_Engineer": "#software"}

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root / "dist"))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
port = server.server_address[1]
with tempfile.TemporaryDirectory() as profile:
    for name, frag in versions.items():
        out = root / "data" / f"Sergio_Adan_Bermudez_CV_{name}.pdf"
        out.unlink(missing_ok=True)
        subprocess.run([chrome, "--headless=new", f"--user-data-dir={profile}", "--disable-gpu", "--no-pdf-header-footer",
                        "--virtual-time-budget=6000", f"--print-to-pdf={out}", f"http://127.0.0.1:{port}/cv.html{frag}"],
                       check=True, capture_output=True)
        for _ in range(60):                      # Chrome can return before the file is written
            if out.exists() and out.stat().st_size > 0:
                break
            time.sleep(0.5)
        else:
            sys.exit(f"no PDF written for {name}")
        print(out.name, out.stat().st_size, "bytes")
server.shutdown()
