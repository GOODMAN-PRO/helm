// Minimal 5-field cron parser (minute hour dom month dow).
// Supports: * specific ranges(1-5) lists(1,2,3) steps(*/5 1-5/2).

function parseField(field, min, max) {
  if (field === '*') return null; // null = any value matches
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangeStr, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (!Number.isInteger(step) || step <= 0)
        throw new Error(`invalid cron step '${stepStr}': must be a positive integer`);
      let start = min, end = max;
      if (rangeStr !== '*') {
        if (rangeStr.includes('-')) {
          const [a, b] = rangeStr.split('-').map(Number);
          start = a; end = b;
        } else {
          start = parseInt(rangeStr, 10);
          // end stays at max: N/step means "start at N, step until max"
        }
      }
      for (let i = start; i <= end; i += step) values.add(i);
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) values.add(i);
    } else {
      values.add(parseInt(part, 10));
    }
  }
  return values;
}

export function cronMatches(expr, date = new Date()) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`invalid cron expression: ${expr}`);
  const [minuteF, hourF, domF, monthF, dowF] = parts;
  const minute = parseField(minuteF, 0, 59);
  const hour   = parseField(hourF,   0, 23);
  const dom    = parseField(domF,    1, 31);
  const month  = parseField(monthF,  1, 12);
  const dow    = parseField(dowF,    0,  6);
  // Vixie cron: day-of-week 7 is also Sunday. getUTCDay() only returns 0-6, so a literal 7
  // (e.g. "* * * * 7" or a range like "5-7") would never match — normalise 7 -> 0.
  if (dow && dow.has(7)) dow.add(0);

  if (minute && !minute.has(date.getUTCMinutes()))   return false;
  if (hour   && !hour.has(date.getUTCHours()))       return false;
  if (month  && !month.has(date.getUTCMonth() + 1))  return false;
  // Day-of-month + day-of-week follow standard (Vixie) cron: when BOTH are restricted, fire if EITHER
  // matches (OR); when only one is restricted, that one must match. (parseField returns falsy for '*'.)
  const domMatch = !dom || dom.has(date.getUTCDate());
  const dowMatch = !dow || dow.has(date.getUTCDay());
  if (dom && dow) { if (!domMatch && !dowMatch) return false; }
  else if (!domMatch || !dowMatch) return false;
  return true;
}

// Returns the next Date (after `from`) when the expression fires.
// Searches minute-by-minute up to 366 days out; returns null if nothing found or expression invalid.
export function nextCronDate(expr, from = new Date()) {
  try {
    const d = new Date(from);
    d.setSeconds(0, 0);
    d.setUTCMinutes(d.getUTCMinutes() + 1); // start one minute after `from`
    const limit = new Date(from.getTime() + 366 * 24 * 60 * 60 * 1000);
    while (d < limit) {
      if (cronMatches(expr, d)) return new Date(d);
      d.setUTCMinutes(d.getUTCMinutes() + 1);
    }
    return null;
  } catch {
    return null;
  }
}
