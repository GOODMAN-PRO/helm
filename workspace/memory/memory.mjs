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
// Active-learning columns. Idempotent: ignore "duplicate column" errors on re-run.
try { db.exec(`ALTER TABLE facts ADD COLUMN evidence_count INTEGER NOT NULL DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE facts ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0`); } catch {}
// Backfill last_seen on rows that pre-date the column. WHERE guard avoids a
// full-table write on every startup once all rows are already set.
db.exec(`UPDATE facts SET last_seen = updated WHERE last_seen = 0`);
// Long-term guard against (kind, key) duplicates. Skip if existing rows already
// violate uniqueness — migrate.mjs handles the dedup-then-create path.
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS facts_kind_key_uniq ON facts(kind, key)`); } catch {}

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

try { await (async () => {
switch (verb) {
  case 'remember': {
    const { flags, pos } = parseFlags(rest);
    const [kind, key, ...valueParts] = pos;
    const value = valueParts.join(' ');
    if (!kind || !key || !value) die('usage: remember <kind> <key> <value>');

    const source = flags.source ?? null;
    const reqConf = parseFloat(flags.confidence ?? 1);
    const force = flags.force === true || flags.force === 'true';
    // Active learning: a single observation is provisional. Confidence only rises with
    // independent repeats. `--force` (or non-observed sources) bypass the cap.
    const isObserved = source === 'observed' && !force;
    const PROVISIONAL_CAP = 0.7;

    const existing = db.prepare(
      `SELECT id, value, confidence, evidence_count FROM facts WHERE kind = ? AND key = ?`
    ).get(kind, key);

    if (existing) {
      const sameValue = existing.value === value;
      let evidence = existing.evidence_count || 1;
      let newConf;
      if (sameValue) {
        evidence += 1;
        if (isObserved) {
          // Independent repeat — let confidence rise toward requested, ratchet only upward.
          newConf = Math.max(existing.confidence, Math.min(reqConf, PROVISIONAL_CAP + 0.05 * (evidence - 1)));
        } else {
          newConf = Math.max(existing.confidence, reqConf);
        }
      } else {
        // Value changed — treat as a new observation; reset evidence and cap if observed.
        evidence = 1;
        newConf = isObserved ? Math.min(reqConf, PROVISIONAL_CAP) : reqConf;
      }
      db.prepare(
        `UPDATE facts SET value = ?, source = ?, confidence = ?, evidence_count = ?,
                          last_seen = unixepoch(), updated = unixepoch()
         WHERE id = ?`
      ).run(value, source, newConf, evidence, existing.id);
      out({ action: 'updated', id: existing.id, kind, key, value, confidence: newConf, evidence_count: evidence });
    } else {
      const conf = isObserved ? Math.min(reqConf, PROVISIONAL_CAP) : reqConf;
      const r = db.prepare(
        `INSERT INTO facts (kind, key, value, source, confidence, evidence_count, last_seen)
         VALUES (?, ?, ?, ?, ?, 1, unixepoch())`
      ).run(kind, key, value, source, conf);
      out({ action: 'inserted', id: r.lastInsertRowid, kind, key, value, confidence: conf, evidence_count: 1 });
    }
    break;
  }

  case 'recall': {
    const { flags, pos } = parseFlags(rest);
    const query = pos.join(' ');
    const limit = parseInt(flags.limit ?? 20, 10);
    const keywordOnly = flags['keyword-only'] === true || flags['keyword-only'] === 'true';

    const allFacts = db.prepare(
      `SELECT * FROM facts ORDER BY updated DESC, confidence DESC LIMIT 500`
    ).all();

    const STOP = new Set(['the','a','an','of','to','in','on','for','and','or','is','are','be',
      'was','were','it','this','that','with','as','by','at','from','do','does','did','i','you','my']);
    const tokenize = s => (s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 1 && !STOP.has(w)) || [];
    const stem = w => w.replace(/ies$/, 'y').replace(/(?:ing|ed|s)$/, '') || w;

    const qTokens = tokenize(query);
    const qStems  = qTokens.map(stem);

    // Keyword score: fraction of query words that appear (substring or stem) in the fact.
    const keywordScore = f => {
      if (!qTokens.length) return 1;
      const haystack = `${f.kind} ${f.key} ${f.value}`.toLowerCase();
      let hits = 0;
      for (let i = 0; i < qTokens.length; i++) {
        if (haystack.includes(qTokens[i]) || haystack.includes(qStems[i])) hits++;
      }
      return hits / qTokens.length;
    };

    // TF-IDF semantic score — fallback when the embedding model is not yet downloaded.
    let semScore = () => 0;
    if (!keywordOnly && qStems.length && allFacts.length >= 3) {
      const docs = allFacts.map(f => tokenize(`${f.kind} ${f.key} ${f.value}`).map(stem));
      const df = new Map();
      for (const doc of docs) for (const w of new Set(doc)) df.set(w, (df.get(w) || 0) + 1);
      const N = docs.length;
      const idf = w => Math.log(1 + N / (1 + (df.get(w) || 0)));
      const vec = toks => {
        const tf = new Map();
        for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
        const v = new Map();
        for (const [w, c] of tf) v.set(w, c * idf(w));
        return v;
      };
      const cosine = (a, b) => {
        if (!a.size || !b.size) return 0;
        let dot = 0, na = 0, nb = 0;
        for (const [, x] of a) na += x * x;
        for (const [, x] of b) nb += x * x;
        const [small, big] = a.size <= b.size ? [a, b] : [b, a];
        for (const [w, x] of small) { const y = big.get(w); if (y) dot += x * y; }
        return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
      };
      const qVec = vec(qStems);
      const docVecs = docs.map(vec);
      semScore = (_, i) => cosine(qVec, docVecs[i]);
    }

    // Real embedding similarity (all-MiniLM-L6-v2 via @xenova/transformers).
    // Only used when the model is already in the local cache; falls back to TF-IDF silently.
    let embedScores = null;
    if (!keywordOnly) {
      try {
        const { ensurePipelineLoaded, embedText, cosineSimilarity, getOrComputeVector } =
          await import('./embed.mjs');
        if (await ensurePipelineLoaded()) {
          const qVec = await embedText(query || ' ');
          embedScores = await Promise.all(
            allFacts.map(f =>
              getOrComputeVector(db, f.id, `${f.kind} ${f.key} ${f.value}`)
                .then(fv => cosineSimilarity(qVec, fv))
            )
          );
        }
      } catch {
        // package missing or model not downloaded — embedScores stays null
      }
    }

    const scored = allFacts.map((f, i) => {
      const k = keywordScore(f);
      const s = semScore(f, i);
      const e = embedScores ? embedScores[i] : null;
      // Blend: take the better of keyword score and semantic score. The 0.9
      // discount was removed — it suppressed the semantic signal below the
      // keyword floor even when the semantic score was higher, making the
      // tiebreaker useless for facts sharing the same keyword score.
      const score = e !== null ? Math.max(k, e) : Math.max(k, s);
      return { ...f, _score: score, _k: k, _s: s };
    });

    const results = scored
      .filter(f => !qTokens.length || f._score > 0.01)
      .sort((a, b) => b._score - a._score || (b._s - a._s) || (b.confidence - a.confidence) || (b.updated - a.updated))
      .slice(0, limit)
      .map(({ _score, _k, _s, ...f }) => f);

    out(results);
    break;
  }

  case 'unsure': {
    // List preferences whose confidence is below the threshold — the ones Helm should
    // confirm with the owner before relying on them.
    const { flags } = parseFlags(rest);
    const threshold = parseFloat(flags.threshold ?? 0.7);
    const rows = db.prepare(
      `SELECT id, kind, key, value, confidence, evidence_count, last_seen, source
         FROM facts
        WHERE kind = 'preference' AND confidence < ?
        ORDER BY confidence ASC, last_seen ASC`
    ).all(threshold);
    out(rows);
    break;
  }

  case 'forget': {
    const { pos } = parseFlags(rest);
    const id = parseInt(pos[0], 10);
    if (!id) die('usage: forget <id>');
    const r = db.prepare(`DELETE FROM facts WHERE id = ?`).run(id);
    // Remove any cached embedding vector (table may not exist yet; ignore error).
    try { db.prepare(`DELETE FROM vectors WHERE fact_id = ?`).run(id); } catch {}
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
    die('verbs: remember | recall | forget | dump | episode | unsure');
}
})(); } finally { db.close(); }
