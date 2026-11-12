#!/usr/bin/env bash
# Builds every artifact from Linux (no wine needed). Usage: build/build-all.sh
set -e
cd "$(dirname "$0")/.."
python3 build/prepare-assets.py
node test/run-tests.js
rm -rf dist
npx electron-builder --linux AppImage
npx electron-builder --mac zip --x64 --arm64
npx electron-builder --win dir
node build/set-win-icon.mjs "dist/win-unpacked/ColesJournal.exe" build/icon.ico
npx electron-builder --win portable --prepackaged dist/win-unpacked
python3 - <<'PY'
import os, zipfile
def zipdir(src, out, prefix, skip=()):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d not in skip]
            for f in files:
                p = os.path.join(root, f); z.write(p, os.path.join(prefix, os.path.relpath(p, src)))
zipdir('dist/win-unpacked', 'dist/ColesJournal-1.0.3-win-x64.zip', "Cole's Journal")
zipdir('.', 'dist/ColesJournal-1.0.3-source.zip', 'coles-journal', skip=('node_modules', 'dist', '.git', 'user-images-backup'))
PY
rm -f dist/*.blockmap dist/builder-debug.yml dist/builder-effective-config.yaml
ls -la dist
