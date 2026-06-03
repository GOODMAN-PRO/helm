#!/usr/bin/env node
// data.mjs — data analysis tool for Helm (CSV / JSON)
// Verbs:
//   summary  --path <file>
//   query    --path <file> [--where "<col><op><val>"] [--select "c1,c2"] [--sort <col>] [--desc true] [--limit N]
//   agg      --path <file> --group <col> --metric <col> --op sum|avg|count|min|max
//   chart    --path <file> --x <col> --y <col> [--type bar|line|pie] [--out <png>]
//
// Always prints ONE JSON object; exits 0.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── arg parsing ────────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const verb = rawArgs[0];

function getArg(name) {
  const idx = rawArgs.indexOf(`--${name}`);
  if (idx === -1) return null;
  const val = rawArgs[idx + 1];
  return (val === undefined || val.startsWith('--')) ? null : val;
}

function die(msg, extra = {}) {
  console.log(JSON.stringify({ ok: false, error: msg, ...extra }));
  process.exit(0); // always exit 0 per HARD RULES
}

// ── CSV parser ─────────────────────────────────────────────────────────────────
// Handles quoted fields, commas inside quotes, newlines inside quotes, header row.
function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  function parseField() {
    if (i < len && text[i] === '"') {
      // quoted field
      i++; // skip opening quote
      let field = '';
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += text[i++];
        }
      }
      return field;
    } else {
      // unquoted field — read until comma or newline
      let field = '';
      while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
        field += text[i++];
      }
      return field;
    }
  }

  function parseRow() {
    const row = [];
    while (i < len) {
      row.push(parseField());
      if (i < len && text[i] === ',') {
        i++; // skip comma — continue to next field
      } else {
        // end of row: consume \r\n or \n
        if (i < len && text[i] === '\r') i++;
        if (i < len && text[i] === '\n') i++;
        break;
      }
    }
    return row;
  }

  while (i < len) {
    // skip blank lines
    if (text[i] === '\r' || text[i] === '\n') {
      if (text[i] === '\r') i++;
      if (i < len && text[i] === '\n') i++;
      continue;
    }
    rows.push(parseRow());
  }

  if (rows.length === 0) return { headers: [], records: [] };

  const headers = rows[0].map(h => h.trim());
  const records = rows.slice(1).map(row => {
    const rec = {};
    headers.forEach((h, idx) => {
      rec[h] = row[idx] !== undefined ? row[idx] : '';
    });
    return rec;
  });

  return { headers, records };
}

// ── type inference ─────────────────────────────────────────────────────────────
function inferType(values) {
  // Non-empty, non-null values
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmpty.length === 0) return 'empty';

  // Check numeric
  const nums = nonEmpty.map(v => Number(v));
  if (nums.every(n => !isNaN(n))) return 'numeric';

  return 'categorical';
}

// ── file loader ────────────────────────────────────────────────────────────────
function loadFile(filePath) {
  if (!existsSync(filePath)) die(`file not found: ${filePath}`);

  const text = readFileSync(filePath, 'utf8');
  const ext = filePath.toLowerCase().split('.').pop();

  if (ext === 'json') {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { die(`invalid JSON: ${e.message}`); }

    // Accept array of objects, or { data: [...] }, or { rows: [...] }
    let records;
    if (Array.isArray(parsed)) {
      records = parsed;
    } else if (parsed.data && Array.isArray(parsed.data)) {
      records = parsed.data;
    } else if (parsed.rows && Array.isArray(parsed.rows)) {
      records = parsed.rows;
    } else {
      die('JSON must be an array of objects (or {data:[...]} / {rows:[...]})');
    }

    if (records.length === 0) return { headers: [], records: [] };
    const headers = Object.keys(records[0]);
    return { headers, records };
  }

  // default: CSV
  return parseCsv(text);
}

// ── numeric stats ──────────────────────────────────────────────────────────────
function numericStats(values) {
  const nums = values.map(v => Number(v)).filter(n => !isNaN(n));
  if (nums.length === 0) return { count: 0, nulls: values.length, min: null, max: null, mean: null, median: null, stddev: null };

  nums.sort((a, b) => a - b);
  const count = nums.length;
  const nulls = values.length - count;
  const min = nums[0];
  const max = nums[nums.length - 1];
  const mean = nums.reduce((s, n) => s + n, 0) / count;

  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];

  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);

  return {
    count,
    nulls,
    min: +min.toPrecision(8),
    max: +max.toPrecision(8),
    mean: +mean.toPrecision(8),
    median: +median.toPrecision(8),
    stddev: +stddev.toPrecision(8),
  };
}

// ── categorical stats ──────────────────────────────────────────────────────────
function categoricalStats(values) {
  const count = values.length;
  const freq = {};
  let nulls = 0;
  for (const v of values) {
    const s = v === null || v === undefined ? '' : String(v).trim();
    if (s === '') { nulls++; continue; }
    freq[s] = (freq[s] || 0) + 1;
  }
  const unique = Object.keys(freq).length;
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, occurrences]) => ({ value, occurrences }));
  return { count, nulls, unique, top };
}

// ── WHERE clause parser / evaluator ───────────────────────────────────────────
// Supports: = != > >= < <= contains
// Parses WITHOUT eval — pure string/regex logic.
const WHERE_OPS = ['>=', '<=', '!=', '>', '<', '=', 'contains'];

function parseWhere(clause) {
  if (!clause) return null;
  // Try each op in order (longest first to avoid partial matches)
  for (const op of WHERE_OPS) {
    const idx = clause.indexOf(op);
    if (idx > 0) {
      const col = clause.slice(0, idx).trim();
      const val = clause.slice(idx + op.length).trim().replace(/^["']|["']$/g, '');
      return { col, op, val };
    }
  }
  die(`cannot parse --where clause: "${clause}". Supported ops: = != > >= < <= contains`);
}

function applyWhere(records, filter) {
  if (!filter) return records;
  const { col, op, val } = filter;
  return records.filter(rec => {
    const rawCell = rec[col];
    if (rawCell === undefined) return false;
    const cellStr = String(rawCell).trim();
    const cellNum = Number(rawCell);
    const valNum = Number(val);

    switch (op) {
      case '=':        return cellStr === val;
      case '!=':       return cellStr !== val;
      case '>':        return !isNaN(cellNum) && !isNaN(valNum) ? cellNum > valNum : cellStr > val;
      case '>=':       return !isNaN(cellNum) && !isNaN(valNum) ? cellNum >= valNum : cellStr >= val;
      case '<':        return !isNaN(cellNum) && !isNaN(valNum) ? cellNum < valNum : cellStr < val;
      case '<=':       return !isNaN(cellNum) && !isNaN(valNum) ? cellNum <= valNum : cellStr <= val;
      case 'contains': return cellStr.toLowerCase().includes(val.toLowerCase());
      default:         return false;
    }
  });
}

// ── verb: summary ──────────────────────────────────────────────────────────────
function runSummary() {
  const filePath = getArg('path');
  if (!filePath) die('summary requires --path');

  const { headers, records } = loadFile(filePath);

  const columns = headers.map(name => {
    const values = records.map(r => r[name] !== undefined ? r[name] : null);
    const type = inferType(values.filter(v => v !== null && String(v).trim() !== ''));

    if (type === 'numeric') {
      return { name, type, stats: numericStats(values) };
    } else {
      return { name, type, stats: categoricalStats(values) };
    }
  });

  console.log(JSON.stringify({ ok: true, rows: records.length, columns }, null, 2));
}

// ── verb: query ────────────────────────────────────────────────────────────────
function runQuery() {
  const filePath = getArg('path');
  if (!filePath) die('query requires --path');

  const { headers, records } = loadFile(filePath);

  // WHERE
  const whereClause = getArg('where');
  const filter = parseWhere(whereClause);
  let rows = applyWhere(records, filter);

  // SELECT
  const selectArg = getArg('select');
  let selectCols = null;
  if (selectArg) {
    selectCols = selectArg.split(',').map(s => s.trim()).filter(Boolean);
    const missing = selectCols.filter(c => !headers.includes(c));
    if (missing.length > 0) die(`unknown columns in --select: ${missing.join(', ')}`);
  }

  // SORT
  const sortCol = getArg('sort');
  if (sortCol) {
    if (!headers.includes(sortCol)) die(`unknown --sort column: ${sortCol}`);
    const desc = getArg('desc') === 'true';
    rows = [...rows].sort((a, b) => {
      const av = Number(a[sortCol]);
      const bv = Number(b[sortCol]);
      const numericCompare = !isNaN(av) && !isNaN(bv);
      const diff = numericCompare ? av - bv : String(a[sortCol]).localeCompare(String(b[sortCol]));
      return desc ? -diff : diff;
    });
  }

  // LIMIT
  const limitArg = getArg('limit');
  if (limitArg !== null) {
    const n = parseInt(limitArg, 10);
    if (isNaN(n) || n < 1) die('--limit must be a positive integer');
    rows = rows.slice(0, n);
  }

  // Narrow columns
  if (selectCols) {
    rows = rows.map(r => {
      const out = {};
      for (const c of selectCols) out[c] = r[c];
      return out;
    });
  }

  console.log(JSON.stringify({ ok: true, count: rows.length, rows }, null, 2));
}

// ── verb: agg ──────────────────────────────────────────────────────────────────
function runAgg() {
  const filePath = getArg('path');
  const groupCol  = getArg('group');
  const metricCol = getArg('metric');
  const op        = getArg('op');

  if (!filePath)  die('agg requires --path');
  if (!groupCol)  die('agg requires --group');
  if (!metricCol && op !== 'count') die('agg requires --metric (except for op=count)');
  if (!op)        die('agg requires --op (sum|avg|count|min|max)');

  const validOps = ['sum', 'avg', 'count', 'min', 'max'];
  if (!validOps.includes(op)) die(`--op must be one of: ${validOps.join('|')}`);

  const { headers, records } = loadFile(filePath);

  if (!headers.includes(groupCol)) die(`unknown --group column: ${groupCol}`);
  if (metricCol && !headers.includes(metricCol)) die(`unknown --metric column: ${metricCol}`);

  // Group records
  const groups = {};
  for (const rec of records) {
    const key = rec[groupCol] !== undefined ? String(rec[groupCol]).trim() : '(blank)';
    if (!groups[key]) groups[key] = [];
    if (op !== 'count') {
      const v = Number(rec[metricCol]);
      if (!isNaN(v)) groups[key].push(v);
    } else {
      groups[key].push(1);
    }
  }

  const result = Object.entries(groups).map(([group, vals]) => {
    let value;
    switch (op) {
      case 'sum':   value = vals.reduce((s, n) => s + n, 0); break;
      case 'avg':   value = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null; break;
      case 'count': value = vals.length; break;
      case 'min':   value = vals.length ? Math.min(...vals) : null; break;
      case 'max':   value = vals.length ? Math.max(...vals) : null; break;
    }
    return { group, value: value !== null ? +value.toPrecision(10) : null };
  });

  // Sort by group name for stable output
  result.sort((a, b) => String(a.group).localeCompare(String(b.group)));

  console.log(JSON.stringify({ ok: true, op, group: groupCol, metric: metricCol || '(count)', results: result }, null, 2));
}

// ── verb: chart ────────────────────────────────────────────────────────────────
async function runChart() {
  const filePath  = getArg('path');
  const xCol      = getArg('x');
  const yCol      = getArg('y');
  const chartType = getArg('type') || 'bar';
  const outPath   = getArg('out') || join(tmpdir(), `helm-data-chart-${Date.now()}.png`);

  if (!filePath) die('chart requires --path');
  if (!xCol)     die('chart requires --x');
  if (!yCol)     die('chart requires --y');

  const validTypes = ['bar', 'line', 'pie'];
  if (!validTypes.includes(chartType)) die(`--type must be one of: ${validTypes.join('|')}`);

  const { headers, records } = loadFile(filePath);

  if (!headers.includes(xCol)) die(`unknown --x column: ${xCol}`);
  if (!headers.includes(yCol)) die(`unknown --y column: ${yCol}`);

  const labels = records.map(r => String(r[xCol] !== undefined ? r[xCol] : ''));
  const data   = records.map(r => {
    const v = Number(r[yCol]);
    return isNaN(v) ? 0 : v;
  });

  // Build Chart.js config
  const colors = [
    'rgba(54,162,235,0.8)', 'rgba(255,99,132,0.8)', 'rgba(75,192,192,0.8)',
    'rgba(255,205,86,0.8)', 'rgba(153,102,255,0.8)', 'rgba(255,159,64,0.8)',
    'rgba(201,203,207,0.8)', 'rgba(100,200,100,0.8)',
  ];

  let chartConfig;

  if (chartType === 'pie') {
    chartConfig = {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map((_, i) => colors[i % colors.length]),
        }],
      },
      options: {
        plugins: {
          title: { display: true, text: `${yCol} by ${xCol}` },
          legend: { position: 'right' },
        },
      },
    };
  } else {
    chartConfig = {
      type: chartType,
      data: {
        labels,
        datasets: [{
          label: yCol,
          data,
          backgroundColor: colors[0],
          borderColor: 'rgba(54,162,235,1)',
          fill: chartType === 'line' ? false : undefined,
          tension: 0.3,
        }],
      },
      options: {
        plugins: {
          title: { display: true, text: `${yCol} by ${xCol}` },
          legend: { display: true },
        },
        scales: {
          x: { title: { display: true, text: xCol } },
          y: { title: { display: true, text: yCol }, beginAtZero: true },
        },
      },
    };
  }

  // Fetch PNG from QuickChart (free, no key)
  const configStr = JSON.stringify(chartConfig);
  const encoded   = encodeURIComponent(configStr);
  const url       = `https://quickchart.io/chart?width=800&height=400&c=${encoded}`;

  let pngBuf;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      die(`QuickChart responded ${res.status}: ${body.slice(0, 200)}`);
    }
    const ab = await res.arrayBuffer();
    pngBuf = Buffer.from(ab);
  } catch (err) {
    die(`chart fetch failed: ${err.message}. QuickChart requires internet access.`);
  }

  if (!pngBuf || pngBuf.length < 100) {
    die('QuickChart returned an empty or too-small response — check internet connectivity');
  }

  writeFileSync(outPath, pngBuf);

  console.log(JSON.stringify({
    ok: true,
    out: outPath,
    size_bytes: pngBuf.length,
    chart_type: chartType,
    x: xCol,
    y: yCol,
    points: labels.length,
  }, null, 2));
}

// ── dispatch ───────────────────────────────────────────────────────────────────
if (!verb || verb.startsWith('--')) {
  die('usage: data.mjs <summary|query|agg|chart> [--flags...]');
}

switch (verb) {
  case 'summary': runSummary(); break;
  case 'query':   runQuery();   break;
  case 'agg':     runAgg();     break;
  case 'chart':   runChart().catch(err => die(`chart error: ${err.message}`)); break;
  default: die(`unknown verb "${verb}". Use: summary | query | agg | chart`);
}
