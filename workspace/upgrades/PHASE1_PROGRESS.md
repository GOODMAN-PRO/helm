# Phase 1 Progress

Started: 2026-05-30

---

## Step 1 — workspace/scheduler/

Status: DONE

Created:
- workspace/scheduler/cron.mjs — 5-field cron parser (matches + next-date)
- workspace/scheduler/init-db.mjs — creates jobs.db (idempotent)
- workspace/scheduler/scheduler.mjs — daemon: ticks 30s, fires due jobs via claude -p
- workspace/scheduler/com.helm.scheduler.plist — launchd plist (not loaded yet)
- workspace/runs/runs.mjs — run-dir helpers (makeRunDir, appendLog, finaliseRun)
- jobs.db initialised and verified

---

## Step 2 — workspace/memory/

Status: DONE

Created:
- workspace/memory/memory.mjs — CLI: remember/recall/forget/dump/episode. Keyword+stemming recall.
- workspace/memory/migrate.mjs — parses CLAUDE.md Profile+Notes into facts. 22 facts migrated.
- memory.db initialised and populated.
- Verified: recall "example query" returns the seeded example facts.

---

## Step 3 — workspace/tools/

Status: DONE

Created:
- workspace/tools/registry.json — 10 built-in tools declared.
- workspace/tools/tools.mjs — dispatcher (list + call verbs).
- workspace/tools/impl/ — one script per tool: screencap, gui.click, gui.type, gui.key,
  imessage.send, discord.attach, memory.remember, memory.recall, scheduler.add, scheduler.list.
- Verified: tools list returns all 10.

---

## Step 4 — workspace/runs/

Status: DONE (created alongside Step 1)

- workspace/runs/runs.mjs — makeRunDir, appendLog, finaliseRun.

---

## Step 5 — Patch index.js + imessage.js

Status: DONE

Changes:
- Both adapters now import workspace/sessions.mjs (unified sessions.db, key='owner').
- 5-min cap lifted to 30 min for chat messages.
- Heartbeat added: after 30s, sends "still working..." every 60s.
- Legacy .sessions.json + .imessage-sessions.json migrated on first import.
- Syntax checked: both files ok.

---

## Step 6 — workspace/tests/smoke.mjs

Status: DONE — ALL 8 TESTS GREEN

Tests:
1. PASS Discord adapter: splitAttachments + chunk parsing
2. PASS iMessage: decodeAttributedBody present and NSString logic intact
3. PASS claude -p: round-trip with --add-dir workspace
4. PASS memory.recall "example query" returns the seeded example facts
5. PASS tools list returns all 10 built-in tools
6. PASS sessions.mjs: get/set/delete round-trip
7. PASS scheduler/cron.mjs: match + nextCronDate
8. PASS runs/runs.mjs: makeRunDir creates directory

---

## Step 7 — Load com.helm.scheduler

Status: DONE

- plist copied to ~/Library/LaunchAgents/com.helm.scheduler.plist
- Loaded via launchctl load
- Confirmed alive: PID visible in `launchctl list | grep helm.scheduler`
- Demo job "good-morning" registered (DISABLED, cron: 0 2 * * 1-5 = 09:00 GMT+7 weekdays).

---

## Step 8 — Update CLAUDE.md

Status: DONE

Added "Phase 1 subsystems" section covering tool registry, structured memory, scheduler, unified sessions.

---

## Step 9 — PHASE1_REPORT.md

Status: DONE

See workspace/upgrades/PHASE1_REPORT.md.

---

## PHASE 1 COMPLETE — smoke.mjs: 8/8 green.
