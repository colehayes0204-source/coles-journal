# Cole's Journal (v1.0.3)

A clean, minimal, light sky-themed desktop trading journal for colehys. It uses monospace for numbers, with a sky-blue accent, Gon green for wins and orange-red for losses.

## What's new in 1.0.3
- Renamed from Gon Journal to **Cole's Journal**. On first launch, data in the old `Gon Journal` folder is copied over automatically, and the old folder is left untouched.
- Entrance: the Gon rod GIF fills the whole window edge to edge, with a small "colehys" in the bottom-left corner that reveals letter by letter with a shimmer, and a small COLE'S JOURNAL line under it. It then blur-fades into the app. Click or press any key to skip.
- 1.0.3: removed every terminal-style prompt line (entrance prompt and progress bar, the status line under the tabs, the Log-a-trade card label, the wizard's step prompt). The wizard now shows a plain "Step 2 of 8".
- Home: an animated "Hello, Cole." greeting and a large **Log a trade?** prompt that opens an 8-step guided wizard (when/what → direction & setup → levels → result → rules → feelings → screenshots → review).
- **Rule streak**: consecutive logged trading days on which every trade kept every rule, with current and best counts, an animated flame and the last 14 days as dots. One broken rule resets it. Calendar days show ✓ or ✕ rule marks. Rules are editable in Settings and default to the 4 mental rules from the Notion journal.

## Tabs
- **Home**: today's date, total R, win rate, net P&L, avg R, current streak, equity curve (cumulative R), recent entries, "Hunter License" profile card, Gon avatar.
- **Training Logs** (*Nen Training*): log trades through the wizard, then edit or delete them in the side drawer. Fields: date, time, instrument, direction, entry, stop, target, result (R), P&L ($), setup, setup notes, emotions/mindset, followed-plan, and screenshots (attach or drag-drop; copied into app data). List view and month calendar (daily R; click a day to filter to it). Filters: search, instrument, side, result, date range.
- **Mentors**: image posts from the X handles you list, newest first, each with its date and caption. Checked every 15 min (configurable). Images are cached locally.
- **Settings**: profile, mentor handles, poll interval, X API bearer token, splash on/off, open data folder.

Shortcuts: `Ctrl/Cmd+N` new log, `Ctrl/Cmd+1..4` switch tabs, `Esc` close.

## Mentors / X API
Uses only the official X API v2: `GET /2/users/by/username/:handle`, then `GET /2/users/:id/tweets?expansions=attachments.media_keys&media.fields=url,preview_image_url&tweet.fields=created_at` (excluding retweets and replies). No scraping.
You need your own **Bearer Token** from the X Developer Console (console.x.com). As of late 2026, X has no free read tier. Reads are prepaid pay-per-use: about **$0.005 per post returned** and **$0.010 per user lookup**, and repeat reads of the same post within a UTC day are free. To keep costs low, the app looks up each handle once (cached), pulls 20 posts the first time, and after that asks only for posts newer than the last one it has (`since_id`). Rate limits (429) back off until `x-rate-limit-reset`. 401, 402, and 403 errors appear in plain English on the Mentors tab.

## Data location
`settings.json`, `logs.json`, `mentor-cache.json`, `screenshots/`, and `mentor-media/` live in the OS app-data folder:
- Windows: `%APPDATA%\Cole's Journal`
- macOS: `~/Library/Application Support/Cole's Journal`
- Linux: `~/.config/Cole's Journal`
(The portable .exe uses the same folder.) To back up, copy that folder.

## Install / run
- **Windows**: double-click `ColesJournal-1.0.3-win-portable.exe` (no install), or unzip `ColesJournal-1.0.3-win-x64.zip` and run `ColesJournal.exe`. The app is unsigned, so SmartScreen will show "Windows protected your PC". Click **More info → Run anyway**.
- **macOS**: unzip `ColesJournal-1.0.3-mac-arm64.zip` (Apple Silicon) or `-mac-x64.zip` (Intel) and drag **Cole's Journal.app** to Applications. The app is unsigned and not notarized, so Gatekeeper blocks the first launch. Right-click the app, choose **Open**, then **Open** again, or go to System Settings → Privacy & Security → **Open Anyway**. If macOS says the app "is damaged", run `xattr -cr "/Applications/Cole's Journal.app"`.
- **Linux**: `chmod +x ColesJournal-1.0.3-linux-x86_64.AppImage && ./ColesJournal-1.0.3-linux-x86_64.AppImage` (needs FUSE; otherwise add `--appimage-extract-and-run`).
- **From source (any OS)**: install Node 18+, then `npm install && npm start`.

## Develop / build
`npm test` runs the unit tests (logs CRUD, stats, rules and rule streak, mocked X API). `test/e2e-ui.js` drives the real UI and the wizard (see `test/e2e-result.json`), and `test/migration.sh` checks the old-folder migration. `test/screenshots.sh` captures every tab under Xvfb. `build/build-all.sh` rebuilds icons and every artifact from Linux without wine. Put the supplied images in `build/source-images/` first (see the README there).

## Credits
Cole supplied the Gon images (portrait, banner, GIF) for his personal use. This app is not affiliated with Hunter x Hunter or its rights holders. Do not redistribute it with those images. Fonts: Inter and JetBrains Mono (SIL OFL, bundled).
