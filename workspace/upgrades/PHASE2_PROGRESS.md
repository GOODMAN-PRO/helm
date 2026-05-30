# Phase 2 Progress Log

Date: 2026-05-30

## Tool 1: browser.* — DONE

- `workspace/tools/impl/browser.mjs` — shared impl for open/read/click/fill/screenshot/close.
- Uses `playwright` + `chromium.launchPersistentContext` with `workspace/browser-profile/`.
- Session URL persists between calls via `workspace/browser-state.json`.
- 6 registry entries: browser.open, browser.read, browser.click, browser.fill, browser.screenshot, browser.close.
- Functional test: `browser.open https://example.com` returns correct title and stripped text.

## Tool 2: imessage.send_to — DONE

- `workspace/tools/impl/imessage.send_to.mjs`.
- Same osascript send as imessage.send. Marked confirm: true.
- Dispatcher confirm gate now enforced: exits 2 with CONFIRM REQUIRED message when --force absent.

## Dispatcher update: confirm gate — DONE

- `workspace/tools/tools.mjs` updated: if tool.confirm is true and --force is not in args, exit 2.
- Covers imessage.send, imessage.send_to, calendar.add.

## Tool 3: calendar.* — IMPL DONE, PERMISSION BLOCKED

- `workspace/tools/impl/calendar.mjs` — JXA (osascript -l JavaScript) for list and add.
- calendar.list queries all calendars for events in next N days.
- calendar.add finds first writable calendar and creates event.
- 2 registry entries: calendar.list (confirm: false), calendar.add (confirm: true).
- BLOCKED: Calendar.app access via JXA requires macOS Automation permission for the process running osascript (Terminal or the launchd node daemon). The call hangs waiting for the system permission dialog. Owner must grant "Automation > Calendar" for Terminal.app (or the launchd job) in System Preferences > Privacy & Security.

## Tool 4: finder.* — DONE

- `workspace/tools/impl/finder.mjs` — mdfind for search, osascript for reveal.
- 2 registry entries: finder.search, finder.reveal.
- Functional test: `finder.search --query "secondme" --limit 5` returns 5 results.

## Tool 5: web.* — DONE

- `workspace/tools/impl/web.mjs` — curl for fetch, DDG HTML for search with Playwright fallback.
- web.search: tries DDG HTML endpoint first (fast, no browser); falls back to Playwright if bot-detection page is returned.
- DDG HTML parser updated to split on `web-result` div blocks, extract result__a and result__snippet.
- Functional test: `web.search --query "playwright headless chromium" --limit 5` returns 5 results with real URLs and snippets.
- Functional test: `web.fetch --url "https://example.com"` returns stripped text.

## Tool 6: email.* — SKIPPED

- No IMAP credentials in `.env`. Only `IMESSAGE_OWNER` is set.
- Skipped per plan rules. Documented in PHASE2_REPORT.md.

## Dependencies installed

- `npm install playwright --save` — 17MB in node_modules.
- `npx playwright install chromium` — 547MB in ~/Library/Caches/ms-playwright (outside project).

## Smoke tests

- `workspace/tests/smoke-phase2.mjs` — 12 tests, all pass.
- `workspace/tests/smoke.mjs` (Phase 1) — 8 tests, all still pass.
