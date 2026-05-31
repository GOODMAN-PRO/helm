#!/usr/bin/env node
// Sentence-embedding helpers using @xenova/transformers all-MiniLM-L6-v2.
// @xenova/transformers and the model weights are loaded lazily — importing this
// module never fails even when the package is absent or the model undownloaded.

let _pipeline = null;

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

// Warms the pipeline if not already loaded. Returns true when loaded, false if unavailable.
// Never triggers a download (allowRemoteModels = false).
export async function ensurePipelineLoaded() {
  try {
    const mod = await import('@xenova/transformers');
    mod.env.allowRemoteModels = false;
    mod.env.allowLocalModels = true;
    _pipeline = await mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return true;
  } catch {
    return false;
  }
}

// DEPRECATED: remove after one release cycle. Alias kept for in-flight callers.
export const isModelAvailable = ensurePipelineLoaded;

async function getPipeline() {
  if (_pipeline) return _pipeline;
  const mod = await import('@xenova/transformers');
  mod.env.allowRemoteModels = false;
  mod.env.allowLocalModels = true;
  _pipeline = await mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return _pipeline;
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
// db must be a node:sqlite DatabaseSync instance (passed from memory.mjs).
export async function getOrComputeVector(db, factId, text) {
  ensureVectorsTable(db);
  const row = db.prepare('SELECT vector FROM vectors WHERE fact_id = ?').get(factId);
  if (row) return JSON.parse(row.vector);
  const vec = await embedText(text);
  db.prepare('INSERT OR REPLACE INTO vectors (fact_id, vector) VALUES (?, ?)').run(
    factId, JSON.stringify(vec)
  );
  return vec;
}
