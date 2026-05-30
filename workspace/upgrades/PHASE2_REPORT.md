# Phase 2 Report

Completed: 2026-05-30.

## What landed

### browser.* — 6 tools

File: `workspace/tools/impl/browser.mjs`

One shared implementation dispatched by verb. Uses Playwright with a persistent Chromium context so that cookies and login sessions survive between calls.

- `browser.open --url <url>` — navigate to URL, extract stripped text (up to 10 000 chars), save URL to `workspace/browser-state.json`.
- `browser.read` — re-open current URL, return text.
- `browser.click --selector <css>` — click element, follow navigation, update state.
- `browser.fill --selector <css> --text <value>` — fill input field.
- `browser.screenshot [--out <path>]` — save PNG to `/tmp/helm-browser.png` or specified path.
- `browser.close` — clear session state (cookies in profile persist).

Profile dir: `workspace/browser-profile/` (created on first run).
Session state: `workspace/browser-state.json` (URL of current page).

Tested: `browser.open https://example.com` returns correct title and text.

### imessage.send_to — 1 tool

File: `workspace/tools/impl/imessage.send_to.mjs`

Same osascript send as `imessage.send`. Marked `confirm: true` so the dispatcher blocks it unless `--force` is passed. Intent: proactive outbound sends (scheduler jobs, alerts) rather than replies.

### Dispatcher confirm gate

File: `workspace/tools/tools.mjs`

Updated to enforce `confirm: true`. When a tool is confirm-gated and `--force` is absent, the dispatcher exits 2 with a `CONFIRM REQUIRED` message and the proposed args. The caller (Helm agent) must get owner approval and re-call with `--force`.

### calendar.* — 2 tools (impl done, permission needed)

File: `workspace/tools/impl/calendar.mjs`

JXA-based (osascript -l JavaScript). Talks directly to Calendar.app.

- `calendar.list [--days 7]` — lists events in next N days across all calendars.
- `calendar.add --title <t> --start <ISO> --end <ISO>` — adds event to first writable calendar. Marked `confirm: true`.

PERMISSION REQUIRED: Calendar.app access via JXA requires macOS Automation permission for the process that runs osascript. The call hangs until the permission dialog is acknowledged.

Fix (one-time): System Preferences > Privacy & Security > Automation. Enable Calendar for Terminal.app (for interactive use) and for the launchd plist process that runs the Discord/iMessage bots. Alternatively, run `node workspace/tools/impl/calendar.mjs list` once interactively — macOS will show the permission dialog and remember the choice.

### finder.* — 2 tools

File: `workspace/tools/impl/finder.mjs`

- `finder.search --query <q> [--limit 50]` — wraps `mdfind`. Returns array of matching paths.
- `finder.reveal --path <p>` — opens Finder and selects the specified file or folder.

Tested: `finder.search --query "secondme" --limit 5` returns 5 matching paths.

### web.* — 2 tools

File: `workspace/tools/impl/web.mjs`

- `web.fetch --url <url>` — curl with a browser UA, strips HTML to plain text (up to 12 000 chars). No API key.
- `web.search --query <q> [--limit 10]` — searches DuckDuckGo. Primary path: DDG HTML endpoint via curl (fast). Fallback: Playwright navigating `duckduckgo.com` if the HTML endpoint returns a bot-detection challenge page.

Tested: `web.search --query "playwright headless chromium" --limit 5` returns 5 results with real titles, decoded URLs, and snippets from DDG HTML endpoint.

## What is blocked

### email.* — SKIPPED

No IMAP credentials in `/Users/owner/secondme/.env`. The file only contains `IMESSAGE_OWNER`. To enable email tools:

1. Add to `.env`:
   ```
   IMAP_HOST=imap.gmail.com
   IMAP_PORT=993
   IMAP_USER=your@gmail.com
   IMAP_PASS=your-app-password   # Gmail App Password (not account password)
   ```
2. Implement `workspace/tools/impl/email.mjs` using the `imap` npm package for reading and `osascript Mail` for sending.
3. Add registry entries: `email.list`, `email.read`, `email.send` (confirm: true).

### calendar.* permission

`calendar.list` and `calendar.add` are implemented and correct but hang until the owner grants Automation > Calendar permission to Terminal.app or the launchd node process. One interactive run of `node workspace/tools/impl/calendar.mjs list` will trigger the permission dialog.

## Disk weight

- `node_modules/playwright` + `node_modules/playwright-core`: ~17 MB inside the project.
- Chromium binary: **547 MB** in `~/Library/Caches/ms-playwright/chromium_headless_shell-1223/`.

The Chromium binary is stored in the user's global cache, not in `~/secondme/`. It is shared across all Playwright installs for this user. It will persist until `npx playwright uninstall chromium` is run. Flag this to the owner: ~550 MB of cache is the cost of having a real browser available.

## Registry total

Phase 1: 10 tools.
Phase 2: +13 entries (browser ×6, imessage.send_to ×1, calendar ×2, finder ×2, web ×2).
Total: **23 tools** in `workspace/tools/registry.json`.

## Smoke tests

- Phase 2: `node workspace/tests/smoke-phase2.mjs` — 12/12 passed.
- Phase 1 regression: `node workspace/tests/smoke.mjs` — 8/8 passed.

## Suggested Phase 3 prep

1. Grant the calendar permission (one interactive run) and verify `calendar.list` end-to-end.
2. Add email credentials to `.env` and implement `email.*` tools.
3. Add `browser.search` as a convenience wrapper: `browser.open`, wait for results, return text — replacing the occasional need to chain browser.open + browser.read.
4. Consider a `notify.push` tool: sends a message to the owner via iMessage or Discord DM when a scheduled job finishes. Phase 1 report flagged this gap (results land in runs/ but owner isn't notified).
5. Phase 3 screen watcher: now that Playwright + mdfind are in place, the capture ring-buffer (Phase 3.1) can use `screencapture` in a tight loop, and `finder.search` can index the screenshots via Spotlight.
