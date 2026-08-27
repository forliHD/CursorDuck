#!/usr/bin/env python3
"""
Kleiner Build-Helfer: nimmt PNG-Daten (Base64) per POST entgegen und legt sie
unter icons/ ab. Damit kann demo/icons.html die Symbole mit derselben
Canvas-Engine rendern, die auch die Ente zeichnet.

    python3 tools/iconserver.py
    # dann http://127.0.0.1:8778/demo/icons.html öffnen und speichern
"""
import base64
import functools
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")


class Handler(SimpleHTTPRequestHandler):
    """Liefert das Projekt aus und nimmt zusätzlich PNGs per POST entgegen."""

    def end_headers(self):
        # Beim Entwickeln nervt der Browser-Cache mehr, als er nützt.
        self.send_header("Cache-Control", "no-store, max-age=0")
        SimpleHTTPRequestHandler.end_headers(self)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        query = parse_qs(urlparse(self.path).query)
        name = (query.get("name") or ["icon.png"])[0]
        name = os.path.basename(name)
        # Zielordner: icons/ (Standard) oder dist/ (Store-Material, z. B. Screenshots)
        target = (query.get("dir") or ["icons"])[0]
        base = os.path.join(ROOT, "dist") if target == "dist" else ICONS
        if not name.endswith(".png"):
            self.send_response(400)
            self._cors()
            self.end_headers()
            self.wfile.write(b"only .png")
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8", "replace")
        if "," in raw and raw.startswith("data:"):
            raw = raw.split(",", 1)[1]

        os.makedirs(base, exist_ok=True)
        path = os.path.join(base, name)
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(raw))

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(("saved %s (%d bytes)" % (name, os.path.getsize(path))).encode())

    def log_message(self, fmt, *args):
        print("[iconserver] " + fmt % args)


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    print("Icon-Server: http://127.0.0.1:8778/demo/icons.html")
    HTTPServer(("127.0.0.1", 8778), handler).serve_forever()
