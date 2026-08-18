#!/usr/bin/env python3
"""
Baut die Store-Pakete aus einer Codebasis:

    python3 tools/build.py

  → dist/cursor-duck-chrome-<version>.zip   (Manifest V3, wie manifest.json)
  → dist/cursor-duck-firefox-<version>.zip  (Manifest V2, automatisch abgeleitet)

Das Firefox-Manifest wird aus manifest.json transformiert statt separat
gepflegt — so kann nichts auseinanderlaufen. Hintergrund: Firefox behandelt
MV3-Hostberechtigungen als opt-in (die Ente erschiene erst nach manueller
Freigabe pro Nutzer), deshalb liefern wir dort MV2 aus, das Mozilla weiterhin
voll unterstützt.
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
DIRS = ["icons", "src", "popup", "welcome", "_locales"]

GECKO_ID = "cursor-duck@forlihd"
# 140 = erste Version mit data_collection_permissions-Unterstützung
GECKO_MIN = "140.0"


def firefox_manifest(m):
    fx = json.loads(json.dumps(m))  # tiefe Kopie
    fx["manifest_version"] = 2
    # MV3 "action" heißt in MV2 "browser_action"
    fx["browser_action"] = fx.pop("action")
    # Firefox nutzt Event-Pages statt Service Worker
    fx["background"] = {"scripts": ["src/background.js"], "persistent": False}
    # Pflicht bei Firefox: feste Add-on-ID (auch Voraussetzung für storage.sync)
    # und die Datensammel-Deklaration (bei uns: keine Datensammlung).
    fx["browser_specific_settings"] = {
        "gecko": {
            "id": GECKO_ID,
            "strict_min_version": GECKO_MIN,
            "data_collection_permissions": {"required": ["none"]}
        },
        # Android kann data_collection_permissions erst ab 142
        "gecko_android": {"strict_min_version": "142.0"}
    }
    return fx


def add_tree(z, top):
    for base, dirs, names in os.walk(os.path.join(ROOT, top)):
        dirs.sort()
        for name in sorted(names):
            if name.startswith("."):
                continue  # .DS_Store & Co.
            full = os.path.join(base, name)
            z.write(full, os.path.relpath(full, ROOT))


def build(tag, manifest_obj, version):
    path = os.path.join(DIST, "cursor-duck-%s-%s.zip" % (tag, version))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest_obj, ensure_ascii=False, indent=2))
        for d in DIRS:
            add_tree(z, d)
    print("gebaut:", os.path.relpath(path, ROOT))
    return path


def main():
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
        chrome = json.load(fh)
    version = chrome["version"]
    os.makedirs(DIST, exist_ok=True)
    build("chrome", chrome, version)
    build("firefox", firefox_manifest(chrome), version)


if __name__ == "__main__":
    sys.exit(main())
