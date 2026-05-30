// Minimal 5-field cron parser (minute hour dom month dow).
// Supports: * specific ranges(1-5) lists(1,2,3) steps(*/5 1-5/2).

function parseField(field, min, max) {
  if (field === '*') return null; // null = any value matches
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangeStr, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      let start = min, end = max;
      if (rangeStr !== '*') {
        if (rangeStr.includes('-')) {
          const [a, b] = rangeStr.split('-').map(Number);
          start = a; end = b;
        } else {
          start = end = parseInt(rangeStr, 10);
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

  if (minute && !minute.has(date.getUTCMinutes()))   return false;
  if (hour   && !hour.has(date.getUTCHours()))       return false;
  if (dom    && !dom.has(date.getUTCDate()))          return false;
  if (month  && !month.has(date.getUTCMonth() + 1))  return false;
  if (dow    && !dow.has(date.getUTCDay()))           return false;
  return true;
}

// Returns the next Date (after `from`) when the expression fires.
// Searches minute-by-minute up to 366 days out; returns null if nothing found.
export function nextCronDate(expr, from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1); // start one minute after `from`
  const limit = new Date(from.getTime() + 366 * 24 * 60 * 60 * 1000);
  while (d < limit) {
    if (cronMatches(expr, d)) return new Date(d);
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}
