# Cole's Journal (v1.2.2)

A clean, minimal, light sky-themed desktop trading journal for colehys. It uses monospace for numbers, with a sky-blue accent, Gon green for wins and orange-red for losses.

## What's new in 1.2.2
- Theme songs play. An uploaded mp3 is copied into the app data folder and streamed from there, including when that folder is named Cole's Journal.

## What's new in 1.2.1
- The entrance clock and name sit directly on the video. The white panels are gone.

## What's new in 1.2.0
- **Entrance**: Cole's dock video loops at half speed, with the local clock, New York time, and Asia / London / New York session pills (ET hours, including the weekend close). It stays until you click. "colehys" sits at the bottom.
- **Theme song**: choose an audio file in Settings. It plays on the entrance and fades out when you enter. Nothing is bundled.
- **Home** fills the window. **Light, dark, and system** themes, with a sun/moon toggle in the top bar.
- **P&L calendar**: net dollars and R by day, weekly totals, and a click-through to that day's trades.
- **Education**: videos grouped by mentor. Local files play in the app; YouTube links embed; other links open outside.

## What's new in 1.1.0
- **Updates**: the installed app checks GitHub Releases on launch and every 4 hours, downloads in the background, and shows an **Update ready** pill. It installs only when you click **Restart**. Settings shows the current version and **Check for updates**.
- **Windows** is now a per-user NSIS installer (`ColesJournal-Setup-1.1.0.exe`, no admin). Portable builds cannot auto-update. Journal files stay in `%APPDATA%\Cole's Journal` across updates. See `RELEASING.md`.

## What's new in 1.0.3
- Renamed from Gon Journal to **Cole's Journal**. On first launch, data in the old `Gon Journal` folder is copied over automatically, and the old folder is left untouched.
- Entrance: the Gon rod GIF fills the whole window edge to edge, with a small "colehys" in the bottom-left corner that reveals letter by letter with a shimmer, and a small COLE'S JOURNAL line under it. It then blur-fades into the app. Click or press any key to skip.
- 1.0.3: removed every terminal-style prompt line (entrance prompt and progress bar, the status line under the tabs, the Log-a-trade card label, the wizard's step prompt). The wizard now shows a plain "Step 2 of 8".
- Home: an animated "Hello, Cole." greeting and a large **Log a trade?** prompt that opens an 8-step guided wizard (when/what → direction & setup → levels → result → rules → feelings → screenshots → review).
- **Rule streak**: consecutive logged trading days on which every trade kept every rule, with current and best counts, an animated flame and the last 14 days as dots. One broken rule resets it. Calendar days show ✓ or ✕ rule marks. Rules are editable in Settings and default to the 4 mental rules from the Notion journal.

## Tabs
- **Home**: today's date, total R, win rate, net P&L, avg R, current streak, equity curve (cumulative R), recent entries, "Hunter License" profile card, Gon avatar. The layout fills the window.
- **Training Logs** (*Nen Training*): log trades through the wizard, then edit or delete them in the side drawer. Fields: date, time, instrument, direction, entry, stop, target, result (R), P&L ($), setup, setup notes, emotions/mindset, followed-plan, and screenshots (attach or drag-drop; copied into app data). List view and month calendar (daily R; click a day to filter to it). Filters: search, instrument, side, result, date range.
- **P&L**: a month calendar of net dollars (R underneath), colored by how big the day was, with a weekly total column. Click a day for that day's trades.
- **Education**: videos grouped by mentor. A local file plays in the app. A YouTube link embeds. Any other https link opens outside. Each one can have tags, notes, timestamps, and a watched mark.
- **Mentors**: image posts from the X handles you list, newest first, each with its date and caption. Checked every 15 min (configurable). Images are cached locally.
- **Settings**: profile, mentor handles, poll interval, X API bearer token, splash on/off, light/dark/system theme, theme song, open data folder, current version, and check for updates.

Shortcuts: `Ctrl/Cmd+N` new log, `Ctrl/Cmd+1..6` switch tabs, `Esc` close.

## Mentors / X API
Uses only the official X API v2: `GET /2/users/by/username/:handle`, then `GET /2/users/:id/tweets?expansions=attachments.media_keys&media.fields=url,preview_image_url&tweet.fields=created_at` (excluding retweets and replies). No scraping.
You need your own **Bearer Token** from the X Developer Console (console.x.com). As of late 2026, X has no free read tier. Reads are prepaid pay-per-use: about **$0.005 per post returned** and **$0.010 per user lookup**, and repeat reads of the same post within a UTC day are free. To keep costs low, the app looks up each handle once (cached), pulls 20 posts the first time, and after that asks only for posts newer than the last one it has (`since_id`). Rate limits (429) back off until `x-rate-limit-reset`. 401, 402, and 403 errors appear in plain English on the Mentors tab.

## Data location
`settings.json`, `logs.json`, `education.json`, `mentor-cache.json`, `screenshots/`, `videos/`, `thumbs/`, `theme/`, and `mentor-media/` live in the OS app-data folder:
- Windows: `%APPDATA%\Cole's Journal`
- macOS: `~/Library/Application Support/Cole's Journal`
- Linux: `~/.config/Cole's Journal`
The installer and later updates use this same folder and do not delete it. To back up, copy that folder.

## Install / run
- **Windows**: run `ColesJournal-Setup-1.2.2.exe`. It installs for the current user (no admin) and adds a desktop shortcut and a Start menu shortcut named Cole's Journal. The app is unsigned, so SmartScreen will show "Windows protected your PC". Click **More info → Run anyway**. After that, updates download in the background; click **Restart** on the Update ready pill to install them.
- **macOS**: unzip `ColesJournal-1.2.2-mac-arm64.zip` (Apple Silicon) or `-mac-x64.zip` (Intel) and drag **Cole's Journal.app** to Applications. The app is unsigned and not notarized, so Gatekeeper blocks the first launch. Right-click the app, choose **Open**, then **Open** again, or go to System Settings → Privacy & Security → **Open Anyway**. If macOS says the app "is damaged", run `xattr -cr "/Applications/Cole's Journal.app"`.
- **Linux**: `chmod +x ColesJournal-1.2.2-linux-x86_64.AppImage && ./ColesJournal-1.2.2-linux-x86_64.AppImage` (needs FUSE; otherwise add `--appimage-extract-and-run`).
- **From source (any OS)**: install Node 18+, then `npm install && npm start`.

## Develop / build
`npm test` runs the unit tests (logs CRUD, stats, rules and rule streak, mocked X API). `test/e2e-ui.js` drives the real UI and the wizard (see `test/e2e-result.json`), and `test/migration.sh` checks the old-folder migration. `test/screenshots.sh` captures every tab under Xvfb. `build/build-all.sh` rebuilds icons and local artifacts from Linux without wine (the Windows file it produces is portable and does not auto-update). The release installer is built on Windows by GitHub Actions; see `RELEASING.md`. Put the supplied images in `build/source-images/` first (see the README there).

## Credits
Cole supplied the Gon images (portrait, banner, GIF) for his personal use. This app is not affiliated with Hunter x Hunter or its rights holders. Do not redistribute it with those images. Fonts: Inter and JetBrains Mono (SIL OFL, bundled).
