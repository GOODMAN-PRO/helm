#!/usr/bin/env node
// Sentence-embedding helpers using @xenova/transformers all-MiniLM-L6-v2.
// @xenova/transformers and the model weights are loaded lazily — importing this
// module never fails even when the package is absent or the model undownloaded.

let _pipeline = null;
// Single shared promise prevents concurrent callers from double-initializing.
let _loadPromise = null;

export function ensureVectorsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vectors (
      fact_id INTEGER PRIMARY KEY,
      vector  TEXT NOT NULL,
      model   TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      created INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

// WeakSet tracks which db instances already have the vectors table, so we don't
// re-execute the DDL on every getOrComputeVector() call.
const _tablesReady = new WeakSet();

// Warms the pipeline if not already loaded. Returns true when loaded, false if unavailable.
// Never triggers a download (allowRemoteModels = false).
export async function ensurePipelineLoaded() {
  if (_pipeline) return true;  // already loaded — skip re-initialization
  try {
    await getPipeline();
    return true;
  } catch {
    return false;
  }
}

// DEPRECATED: remove after one release cycle. Alias kept for in-flight callers.
export const isModelAvailable = ensurePipelineLoaded;

async function getPipeline() {
  if (_pipeline) return _pipeline;
  if (!_loadPromise) {
    _loadPromise = import('@xenova/transformers').then(mod => {
      mod.env.allowRemoteModels = false;
      mod.env.allowLocalModels = true;
      return mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }).then(p => {
      _pipeline = p;
      return p;
    }).catch(e => {
      _loadPromise = null;  // allow retry if model becomes available later
      throw e;
    });
  }
  return _loadPromise;
}

// Compute a sentence embedding vector (384-dim, L2-normalised).
export async function embedText(text) {
  const p = await getPipeline();
  const out = await p(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

// Cosine similarity between two numeric arrays. Returns 0 on invalid input.
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Look up a cached vector for factId in db.vectors; compute and store if absent.
// Returns null when the model is unavailable. db must be a node:sqlite DatabaseSync instance.
export async function getOrComputeVector(db, factId, text) {
  if (!_tablesReady.has(db)) {
    ensureVectorsTable(db);
    _tablesReady.add(db);
  }
  const row = db.prepare('SELECT vector FROM vectors WHERE fact_id = ?').get(factId);
  if (row) return JSON.parse(row.vector);
  let vec;
  try {
    vec = await embedText(text);
  } catch {
    return null;  // model absent or unavailable — caller handles null gracefully
  }
  db.prepare('INSERT OR REPLACE INTO vectors (fact_id, vector) VALUES (?, ?)').run(
    factId, JSON.stringify(vec)
  );
  return vec;
}
