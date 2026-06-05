function parseField(field, min, max) {
  if (field === '*') return null;
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


  if (dow && dow.has(7)) dow.add(0);

  if (minute && !minute.has(date.getUTCMinutes()))   return false;
  if (hour   && !hour.has(date.getUTCHours()))       return false;
  if (month  && !month.has(date.getUTCMonth() + 1))  return false;


  const domMatch = !dom || dom.has(date.getUTCDate());
  const dowMatch = !dow || dow.has(date.getUTCDay());
  if (dom && dow) { if (!domMatch && !dowMatch) return false; }
  else if (!domMatch || !dowMatch) return false;
  return true;
}



export function nextCronDate(expr, from = new Date()) {
  try {
    const d = new Date(from);
    d.setSeconds(0, 0);
    d.setUTCMinutes(d.getUTCMinutes() + 1);
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
