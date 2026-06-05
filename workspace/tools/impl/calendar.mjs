#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { macOnlyOrExit } from './mac-only.mjs';

macOnlyOrExit('calendar');
const verb    = process.argv[2];
const rawArgs = process.argv.slice(3);
const get     = k => { const i = rawArgs.indexOf(`--${k}`); return i !== -1 ? rawArgs[i + 1] : null; };

function runJxa(script) {
  const r = spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], {
    encoding: 'utf8', timeout: 20_000,
  });
  if (r.status !== 0) throw new Error(r.stderr?.trim() || 'osascript JXA failed');
  return r.stdout.trim();
}

if (verb === 'list') {
  const days = parseInt(get('days') || '7', 10);
  if (isNaN(days) || days < 1) { console.error('--days must be a positive integer'); process.exit(1); }

  const jxa = `
    const app = Application('Calendar');
    const now = new Date();
    const cutoff = new Date(now.getTime() + ${days} * 86400000);
    const results = [];
    const cals = app.calendars();
    for (const cal of cals) {
      let evts;
      try { evts = cal.events(); } catch { continue; }
      for (const e of evts) {
        let start;
        try { start = e.startDate(); } catch { continue; }
        if (start >= now && start <= cutoff) {
          results.push({
            calendar: cal.name(),
            summary: (function(){ try { return e.summary(); } catch { return ''; } })(),
            start: start.toISOString(),
            end: (function(){ try { return e.endDate().toISOString(); } catch { return ''; } })(),
            location: (function(){ try { return e.location() || ''; } catch { return ''; } })(),
          });
        }
      }
    }
    results.sort((a, b) => a.start < b.start ? -1 : 1);
    JSON.stringify(results);
  `;

  try {
    const out = runJxa(jxa);

    const cleaned = out.replace(/^"|"$/g, '').replace(/\\"/g, '"');
    const events  = JSON.parse(cleaned.startsWith('[') ? cleaned : out);
    console.log(JSON.stringify({ ok: true, days, count: events.length, events }));
  } catch (e) {
    console.error(`calendar.list failed: ${e.message}`);
    process.exit(1);
  }

} else if (verb === 'add') {
  const title = get('title');
  const start = get('start');
  const end   = get('end');

  if (!title || !start || !end) {
    console.error('--title, --start (ISO 8601), and --end (ISO 8601) required');
    process.exit(1);
  }

  // Validate ISO dates
  const startMs = Date.parse(start);
  const endMs   = Date.parse(end);
  if (isNaN(startMs) || isNaN(endMs)) {
    console.error('--start and --end must be valid ISO 8601 date strings');
    process.exit(1);
  }
  if (endMs <= startMs) {
    console.error('--end must be after --start');
    process.exit(1);
  }

  const jxa = `
    const app = Application('Calendar');
    const cals = app.calendars();
    let target = null;
    for (const c of cals) {
      let writable = true;
      try { writable = c.writable(); } catch {}
      if (writable) { target = c; break; }
    }
    if (!target) throw new Error('no writable calendar found');
    const ev = app.Event({
      summary: ${JSON.stringify(title)},
      startDate: new Date(${startMs}),
      endDate: new Date(${endMs}),
    });
    target.events.push(ev);
    app.reloadCalendars();
    JSON.stringify({ ok: true, summary: ${JSON.stringify(title)}, start: ${JSON.stringify(start)}, end: ${JSON.stringify(end)}, calendar: target.name() });
  `;

  try {
    const out     = runJxa(jxa);
    const cleaned = out.replace(/^"|"$/g, '').replace(/\\"/g, '"');
    const result  = JSON.parse(cleaned.startsWith('{') ? cleaned : out);
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(`calendar.add failed: ${e.message}`);
    process.exit(1);
  }

} else {
  console.error(`unknown calendar verb: ${verb}. Use list or add.`);
  process.exit(1);
}
