# Releasing Cole's Journal

Installed copies check this repo's GitHub Releases and update themselves.

1. Bump `version` in `package.json` (for example `1.1.0` to `1.2.0`). The tag must match that version.
2. Commit the change on `main`.
3. Tag it `vX.Y.Z` and push both:

```
git push origin main
git push origin vX.Y.Z
```

GitHub Actions (`.github/workflows/release.yml`) runs the unit tests, then builds and publishes with `electron-builder --publish always`:

- Windows: `ColesJournal-Setup-X.Y.Z.exe` plus `latest.yml` (this is what installed apps download)
- macOS: zip
- Linux: AppImage

The release is published, not left as a draft. Apps already installed check on launch and every 4 hours, download in the background, and show **Update ready**. Nothing restarts until Cole clicks **Restart**. Journal data stays in the app-data folder (`%APPDATA%\Cole's Journal` on Windows) and is not replaced by the installer.

The app is unsigned. Windows SmartScreen shows "Windows protected your PC" the first time the installer runs. Click **More info → Run anyway**.
