#!/usr/bin/env node
// Helm structured memory CLI.
// Usage:
//   memory.mjs remember <kind> <key> <value> [--source <s>] [--confidence <0-1>]
//   memory.mjs recall <query> [--limit N] [--keyword-only]
//   memory.mjs forget <id>
//   memory.mjs dump [--kind <kind>] [--all]
//   memory.mjs history <key>
//   memory.mjs episode [add <summary>]
//   memory.mjs unsure [--threshold <0-1>]
//
// Exits 0 on success, 1 on error. Output is JSON on stdout.

import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'memory.db');

const db = new DatabaseSync(DB_PATH);
// Wait out (don't crash on) concurrent writers — background think/consolidate can
// touch this DB while an interactive recall runs. Matches sessions.mjs.
db.exec(`PRAGMA busy_timeout = 5000`);
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
db.exec(`UPDATE facts SET last_seen = updated WHERE last_seen = 0`);

// Temporal validity columns.
try { db.exec(`ALTER TABLE facts ADD COLUMN valid_from INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE facts ADD COLUMN expired_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE facts ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`); } catch {}
db.exec(`UPDATE facts SET valid_from = created WHERE valid_from = 0`);

// Partial unique index: uniqueness enforced only among active (non-expired) rows.
// Allows multiple expired rows per (kind, key) while keeping one active row unique.
// Migration: if a full index already exists, rebuild it as partial.
try {
  const idxRow = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='index' AND name='facts_kind_key_uniq'`
  ).get();
  if (!idxRow || !(idxRow.sql || '').includes('WHERE')) {
    db.exec(`DROP INDEX IF EXISTS facts_kind_key_uniq`);
    db.exec(`CREATE UNIQUE INDEX facts_kind_key_uniq ON facts(kind, key) WHERE expired_at IS NULL`);
  }
} catch {
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS facts_kind_key_uniq ON facts(kind, key) WHERE expired_at IS NULL`); } catch {}
}

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
    const isObserved = source === 'observed' && !force;
    const PROVISIONAL_CAP = 0.7;

    const existing = db.prepare(
      `SELECT id, value, confidence, evidence_count FROM facts WHERE kind = ? AND key = ? AND expired_at IS NULL`
    ).get(kind, key);

    if (existing) {
      const sameValue = existing.value === value;
      let evidence = existing.evidence_count || 1;
      let newConf;
      if (sameValue) {
        evidence += 1;
        if (isObserved) {
          newConf = Math.max(existing.confidence, Math.min(reqConf, PROVISIONAL_CAP + 0.05 * (evidence - 1)));
        } else {
          newConf = Math.max(existing.confidence, reqConf);
        }
        db.prepare(
          `UPDATE facts SET value = ?, source = ?, confidence = ?, evidence_count = ?,
                            last_seen = unixepoch(), updated = unixepoch()
           WHERE id = ?`
        ).run(value, source, newConf, evidence, existing.id);
        out({ action: 'updated', id: existing.id, kind, key, value, confidence: newConf, evidence_count: evidence });
      } else {
        // Value changed: expire old row and insert a new active row.
        evidence = 1;
        newConf = isObserved ? Math.min(reqConf, PROVISIONAL_CAP) : reqConf;
        db.prepare(`UPDATE facts SET expired_at = unixepoch() WHERE id = ?`).run(existing.id);
        const r = db.prepare(
          `INSERT INTO facts (kind, key, value, source, confidence, evidence_count, last_seen, valid_from)
           VALUES (?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())`
        ).run(kind, key, value, source, newConf);
        // Skip episode-log noise:
        //   1. Smoke-test keys (__smoke_*) — these flip on every test run.
        //   2. Identical supersede within the last 6h for the same (kind, key) — collapse repeats
        //      (e.g. autonomy_mode flips, mode commands) into a single episode per quiet window.
        const isSmoke = key.startsWith('__smoke');
        let recentDup = null;
        if (!isSmoke) {
          recentDup = db.prepare(
            `SELECT id FROM episodes
              WHERE channel = 'memory'
                AND summary = ?
                AND ts >= unixepoch() - 21600
              LIMIT 1`
          ).get(`fact superseded: ${kind}/${key}`);
        }
        if (!isSmoke && !recentDup) {
          db.prepare(`INSERT INTO episodes (summary, channel) VALUES (?, 'memory')`).run(
            `fact superseded: ${kind}/${key}`
          );
        } else if (recentDup) {
          db.prepare(`UPDATE episodes SET ts = unixepoch() WHERE id = ?`).run(recentDup.id);
        }
        out({ action: 'superseded', id: r.lastInsertRowid, old_id: existing.id, kind, key, value, confidence: newConf, evidence_count: 1 });
      }
    } else {
      const conf = isObserved ? Math.min(reqConf, PROVISIONAL_CAP) : reqConf;
      const r = db.prepare(
        `INSERT INTO facts (kind, key, value, source, confidence, evidence_count, last_seen, valid_from)
         VALUES (?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())`
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

    // Only active (non-expired) facts.
    const allFacts = db.prepare(
      `SELECT * FROM facts WHERE expired_at IS NULL ORDER BY updated DESC, confidence DESC LIMIT 500`
    ).all();

    const STOP = new Set(['the','a','an','of','to','in','on','for','and','or','is','are','be',
      'was','were','it','this','that','with','as','by','at','from','do','does','did','i','you','my']);
    const tokenize = s => (s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 1 && !STOP.has(w)) || [];
    const stem = w => w.replace(/ies$/, 'y').replace(/(?:ing|ed|s)$/, '') || w;

    const qTokens = tokenize(query);
    const qStems  = qTokens.map(stem);

    if (!qTokens.length) {
      out(allFacts.slice(0, limit));
      break;
    }

    // Tokenize all facts.
    const docs = allFacts.map(f => tokenize(`${f.kind} ${f.key} ${f.value}`).map(stem));

    // Document frequency map (shared by BM25 and TF-IDF).
    const df = new Map();
    for (const doc of docs) for (const w of new Set(doc)) df.set(w, (df.get(w) || 0) + 1);
    const N = docs.length || 1;
    const avgdl = docs.reduce((s, d) => s + d.length, 0) / N || 1;

    // BM25 scorer (k1=1.5, b=0.75).
    const BM25_K1 = 1.5, BM25_B = 0.75;
    const bm25Score = docToks => {
      const dl = docToks.length;
      const tf = new Map();
      for (const w of docToks) tf.set(w, (tf.get(w) || 0) + 1);
      let score = 0;
      for (const qt of qStems) {
        const f = tf.get(qt) || 0;
        if (!f) continue;
        const ni = df.get(qt) || 0;
        const idf = Math.log((N - ni + 0.5) / (ni + 0.5) + 1);
        score += idf * (f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl));
      }
      return score;
    };
    const bm25Scores = docs.map(bm25Score);

    // TF-IDF cosine (fallback when embeddings unavailable).
    const idfFn = w => Math.log(1 + N / (1 + (df.get(w) || 0)));
    const tfidfVec = toks => {
      const tf = new Map();
      for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
      const v = new Map();
      for (const [w, c] of tf) v.set(w, c * idfFn(w));
      return v;
    };
    const cosineMapsFn = (a, b) => {
      if (!a.size || !b.size) return 0;
      let dot = 0, na = 0, nb = 0;
      for (const [, x] of a) na += x * x;
      for (const [, x] of b) nb += x * x;
      const [small, big] = a.size <= b.size ? [a, b] : [b, a];
      for (const [w, x] of small) { const y = big.get(w); if (y) dot += x * y; }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
    };

    // Cosine scores: try real embeddings first, fall back to TF-IDF.
    let cosScores = null;
    if (!keywordOnly) {
      if (qStems.length && allFacts.length >= 3) {
        const qVec = tfidfVec(qStems);
        const docVecs = docs.map(tfidfVec);
        cosScores = docVecs.map(dv => cosineMapsFn(qVec, dv));
      } else {
        cosScores = allFacts.map(() => 0);
      }
      // Try real embedding similarity (all-MiniLM-L6-v2 via @xenova/transformers).
      // Only used when the model is already in the local cache; falls back to TF-IDF silently.
      try {
        const { ensurePipelineLoaded, embedText, cosineSimilarity, getOrComputeVector } =
          await import('./embed.mjs');
        if (await ensurePipelineLoaded()) {
          const qVec = await embedText(query || ' ');
          cosScores = await Promise.all(
            allFacts.map(f =>
              getOrComputeVector(db, f.id, `${f.kind} ${f.key} ${f.value}`)
                .then(fv => cosineSimilarity(qVec, fv))
            )
          );
        }
      } catch {
        // no model — keep TF-IDF cosScores
      }
    }

    // 1.3x boost when any query stem appears in the fact key.
    const keyMatchBoost = f => {
      const keyStems = tokenize(f.key).map(stem);
      return qStems.some(qt => keyStems.includes(qt)) ? 1.3 : 1.0;
    };
    const confWeight = f => 0.7 + 0.3 * f.confidence;

    let scored;
    if (keywordOnly || !cosScores) {
      // BM25-only path: score = bm25 * confWeight * keyBoost
      scored = allFacts.map((f, i) => ({
        ...f,
        _score: bm25Scores[i] * confWeight(f) * keyMatchBoost(f),
      }));
      const results = scored
        .filter(f => f._score > 0)
        .sort((a, b) => b._score - a._score || b.confidence - a.confidence || b.updated - a.updated)
        .slice(0, limit)
        .map(({ _score, ...f }) => f);
      for (const f of results) {
        db.prepare(`UPDATE facts SET access_count = access_count + 1 WHERE id = ?`).run(f.id);
      }
      out(results);
      break;
    }

    // RRF fusion: rank BM25 and cosine independently, combine via Reciprocal Rank Fusion.
    // score = (1/(60+bm25_rank) + 1/(60+cos_rank)) * confWeight * keyBoost
    const bm25Idx = allFacts.map((_, i) => i).sort((a, b) => bm25Scores[b] - bm25Scores[a]);
    const bm25Rank = new Array(allFacts.length);
    bm25Idx.forEach((idx, rank) => { bm25Rank[idx] = rank; });

    const cosIdx = allFacts.map((_, i) => i).sort((a, b) => cosScores[b] - cosScores[a]);
    const cosRank = new Array(allFacts.length);
    cosIdx.forEach((idx, rank) => { cosRank[idx] = rank; });

    scored = allFacts.map((f, i) => {
      const rrf = 1 / (60 + bm25Rank[i]) + 1 / (60 + cosRank[i]);
      return {
        ...f,
        _score: rrf * confWeight(f) * keyMatchBoost(f),
        _bm25: bm25Scores[i],
        _cos: cosScores[i],
      };
    });

    const results = scored
      .filter(f => f._bm25 > 0 || f._cos > 0.01)
      .sort((a, b) => b._score - a._score || b.confidence - a.confidence || b.updated - a.updated)
      .slice(0, limit)
      .map(({ _score, _bm25, _cos, ...f }) => f);

    for (const f of results) {
      db.prepare(`UPDATE facts SET access_count = access_count + 1 WHERE id = ?`).run(f.id);
    }

    out(results);
    break;
  }

  case 'unsure': {
    const { flags } = parseFlags(rest);
    const threshold = parseFloat(flags.threshold ?? 0.7);
    const rows = db.prepare(
      `SELECT id, kind, key, value, confidence, evidence_count, last_seen, source
         FROM facts
        WHERE kind = 'preference' AND confidence < ? AND expired_at IS NULL
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
    try { db.prepare(`DELETE FROM vectors WHERE fact_id = ?`).run(id); } catch {}
    out({ deleted: r.changes, id });
    break;
  }

  case 'dump': {
    const { flags } = parseFlags(rest);
    const showAll = flags.all === true || flags.all === 'true';
    const activeFilter = showAll ? '' : 'AND expired_at IS NULL';
    let rows;
    if (flags.kind) {
      rows = db.prepare(
        `SELECT * FROM facts WHERE kind = ? ${activeFilter} ORDER BY updated DESC`
      ).all(flags.kind);
    } else {
      rows = db.prepare(
        `SELECT * FROM facts WHERE 1=1 ${activeFilter} ORDER BY kind, updated DESC`
      ).all();
    }
    out(rows);
    break;
  }

  case 'history': {
    // Return all versions of facts with the given key (active + expired), newest first.
    const { pos } = parseFlags(rest);
    const key = pos[0];
    if (!key) die('usage: history <key>');
    const rows = db.prepare(
      `SELECT * FROM facts WHERE key = ? ORDER BY valid_from DESC, id DESC`
    ).all(key);
    out(rows);
    break;
  }

  case 'episode': {
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
    die('verbs: remember | recall | forget | dump | episode | unsure | history');
}
})(); } finally { db.close(); }
