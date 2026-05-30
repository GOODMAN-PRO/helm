#!/usr/bin/env node
// Helm structured memory CLI.
// Usage:
//   memory.mjs remember <kind> <key> <value> [--source <s>] [--confidence <0-1>]
//   memory.mjs recall <query> [--limit N]
//   memory.mjs forget <id>
//   memory.mjs dump [--kind <kind>]
//
// Exits 0 on success, 1 on error. Output is JSON on stdout.

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'memory.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS facts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL DEFAULT 'fact',
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    source     TEXT,
    confidence REAL    NOT NULL DEFAULT 1.0,
    created    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated    INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      INTEGER NOT NULL DEFAULT (unixepoch()),
    channel TEXT,
    summary TEXT NOT NULL,
    raw_ref TEXT
  );

  CREATE TABLE IF NOT EXISTS links (
    from_id INTEGER NOT NULL,
    to_id   INTEGER NOT NULL,
    kind    TEXT    NOT NULL,
    PRIMARY KEY (from_id, to_id, kind)
  );
`);

const [,, verb, ...rest] = process.argv;

function parseFlags(args) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1] ?? true;
      i++;
    } else {
      pos.push(args[i]);
    }
  }
  return { flags, pos };
}

function out(obj) { console.log(JSON.stringify(obj, null, 2)); }
function die(msg) { console.error(msg); process.exit(1); }

switch (verb) {
  case 'remember': {
    const { flags, pos } = parseFlags(rest);
    const [kind, key, ...valueParts] = pos;
    const value = valueParts.join(' ');
    if (!kind || !key || !value) die('usage: remember <kind> <key> <value>');

    const existing = db.prepare(
      `SELECT id FROM facts WHERE kind = ? AND key = ?`
    ).get(kind, key);

    if (existing) {
      db.prepare(
        `UPDATE facts SET value = ?, source = ?, confidence = ?, updated = unixepoch()
         WHERE id = ?`
      ).run(value, flags.source ?? null, parseFloat(flags.confidence ?? 1), existing.id);
      out({ action: 'updated', id: existing.id, kind, key, value });
    } else {
      const r = db.prepare(
        `INSERT INTO facts (kind, key, value, source, confidence) VALUES (?, ?, ?, ?, ?)`
      ).run(kind, key, value, flags.source ?? null, parseFloat(flags.confidence ?? 1));
      out({ action: 'inserted', id: r.lastInsertRowid, kind, key, value });
    }
    break;
  }

  case 'recall': {
    const { flags, pos } = parseFlags(rest);
    const query = pos.join(' ');
    const limit = parseInt(flags.limit ?? 20, 10);

    // Keyword + recency ranking.
    // Split query into words, score each fact by how many words appear in key+value.
    const allFacts = db.prepare(
      `SELECT * FROM facts ORDER BY updated DESC, confidence DESC LIMIT 500`
    ).all();

    const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    // Stem each query word by stripping trailing 's'/'ing'/'ed' for simple plurals/conjugations.
    const stems = words.map(w => w.replace(/(?:ing|ed|s)$/, '').replace(/ies$/, 'y') || w);
    const scored = allFacts.map(f => {
      const haystack = `${f.kind} ${f.key} ${f.value}`.toLowerCase();
      let hits = 0;
      for (let i = 0; i < words.length; i++) {
        if (haystack.includes(words[i]) || (stems[i] && haystack.includes(stems[i]))) hits++;
      }
      return { ...f, _score: words.length ? hits / words.length : 1 };
    });

    const results = scored
      .filter(f => !words.length || f._score > 0)
      .sort((a, b) => b._score - a._score || b.updated - a.updated)
      .slice(0, limit)
      .map(({ _score, ...f }) => f);

    out(results);
    break;
  }

  case 'forget': {
    const { pos } = parseFlags(rest);
    const id = parseInt(pos[0], 10);
    if (!id) die('usage: forget <id>');
    const r = db.prepare(`DELETE FROM facts WHERE id = ?`).run(id);
    out({ deleted: r.changes, id });
    break;
  }

  case 'dump': {
    const { flags } = parseFlags(rest);
    let rows;
    if (flags.kind) {
      rows = db.prepare(`SELECT * FROM facts WHERE kind = ? ORDER BY updated DESC`).all(flags.kind);
    } else {
      rows = db.prepare(`SELECT * FROM facts ORDER BY kind, updated DESC`).all();
    }
    out(rows);
    break;
  }

  case 'episode': {
    // memory.mjs episode add <summary> [--channel c] [--raw_ref r]
    const { flags, pos } = parseFlags(rest);
    const subverb = pos[0];
    if (subverb === 'add') {
      const summary = pos.slice(1).join(' ');
      if (!summary) die('usage: episode add <summary>');
      const r = db.prepare(
        `INSERT INTO episodes (summary, channel, raw_ref) VALUES (?, ?, ?)`
      ).run(summary, flags.channel ?? null, flags.raw_ref ?? null);
      out({ action: 'inserted', id: r.lastInsertRowid, summary });
    } else {
      const rows = db.prepare(`SELECT * FROM episodes ORDER BY ts DESC LIMIT 50`).all();
      out(rows);
    }
    break;
  }

  default:
    die('verbs: remember | recall | forget | dump | episode');
}

db.close();
