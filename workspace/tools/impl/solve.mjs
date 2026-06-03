#!/usr/bin/env node
// Helm elite structured problem-solver.
// Usage:
//   solve.mjs --problem "<text>" [--mode quick|deep] [--constraints "<text>"]
//
// quick (default): one claude -p call with a rigorous framework prompt → parse JSON → return.
// deep: up to 4 sequential claude -p calls (decompose → approaches → evaluate → synthesize).
// Always outputs exactly ONE JSON object: {ok, problem, approaches, solution, steps, assumptions, risks, confidence}

import { spawnSync } from 'node:child_process';

// ── arg parsing ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };

const problem     = get('problem');
const mode        = get('mode') || 'quick';
const constraints = get('constraints') || '';

if (!problem) {
  console.log(JSON.stringify({ ok: false, error: '--problem is required' }));
  process.exit(0);
}
if (!['quick', 'deep'].includes(mode)) {
  console.log(JSON.stringify({ ok: false, error: '--mode must be quick or deep' }));
  process.exit(0);
}

// ── claude runner ───────────────────────────────────────────────────────────────
function runClaude(prompt) {
  const r = spawnSync('claude', ['-p', prompt], { encoding: 'utf8', timeout: 120_000 });
  if (r.error) throw new Error(`claude exec failed: ${r.error.message}`);
  return (r.stdout || '').trim();
}

// ── JSON extraction ─────────────────────────────────────────────────────────────
// Tries: strict JSON parse → first {...} block → wrapped prose fallback.
function extractJson(raw) {
  // Try bare parse
  try { return JSON.parse(raw); } catch {}

  // Try first {...} block (handles markdown fences)
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }

  // Graceful wrap: treat raw text as solution prose
  return null;
}

// Normalise whatever claude returned into our schema.
function normalise(parsed, problem, raw) {
  if (!parsed) {
    // Pure prose fallback
    return {
      ok: true,
      problem,
      approaches: ['(see solution)'],
      solution: raw.slice(0, 2000),
      steps: [],
      assumptions: [],
      risks: [],
      confidence: 0.5,
    };
  }
  return {
    ok: true,
    problem,
    approaches:   Array.isArray(parsed.approaches)  ? parsed.approaches  : [String(parsed.approaches  || '')],
    solution:     String(parsed.solution             || parsed.answer || parsed.summary || ''),
    steps:        Array.isArray(parsed.steps)        ? parsed.steps        : [],
    assumptions:  Array.isArray(parsed.assumptions)  ? parsed.assumptions  : [],
    risks:        Array.isArray(parsed.risks)        ? parsed.risks        : [],
    confidence:   typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
  };
}

// ── QUICK mode ─────────────────────────────────────────────────────────────────
function runQuick() {
  const constraintLine = constraints
    ? `\nConstraints / context: ${constraints}`
    : '';

  const prompt = `You are an elite problem-solving engine. Analyse the following problem with rigorous engineering discipline.${constraintLine}

Problem: ${problem}

Follow this exact framework:
1. DECOMPOSE — break the problem into its core sub-problems or requirements.
2. APPROACHES — generate exactly 2–3 distinct solution approaches (trade-offs included).
3. CRITIQUE — find the main weakness in each approach.
4. BEST SOLUTION — pick the strongest approach and state it concisely.
5. CONCRETE STEPS — ordered list of specific, actionable implementation steps.
6. ASSUMPTIONS — list every assumption you made.
7. RISKS — list the top risks or failure modes.
8. SELF-CHECK — does the solution actually solve the stated problem? Note any gaps.
9. CONFIDENCE — a number 0–1 reflecting your overall confidence in this solution.

Respond with STRICT JSON only — no prose, no markdown fences. Schema:
{
  "approaches": ["<approach 1: name + summary>", "..."],
  "solution": "<best solution in 2–4 sentences>",
  "steps": ["<step 1>", "<step 2>", "..."],
  "assumptions": ["..."],
  "risks": ["..."],
  "confidence": 0.0
}`;

  const raw    = runClaude(prompt);
  const parsed = extractJson(raw);
  return normalise(parsed, problem, raw);
}

// ── DEEP mode ──────────────────────────────────────────────────────────────────
function runDeep() {
  const ctx = constraints ? `Constraints: ${constraints}\n` : '';

  // Stage 1: decompose
  const decompose = runClaude(
    `${ctx}Problem: ${problem}\n\nDecompose this problem into its 3–5 core sub-problems or requirements. ` +
    `Return STRICT JSON only: {"subproblems": ["..."]}`,
  );
  let subproblems = [];
  try {
    const d = extractJson(decompose);
    subproblems = (d && Array.isArray(d.subproblems)) ? d.subproblems : [decompose.slice(0, 500)];
  } catch { subproblems = [decompose.slice(0, 500)]; }

  // Stage 2: generate approaches
  const appr = runClaude(
    `${ctx}Problem: ${problem}\nSub-problems: ${subproblems.join('; ')}\n\n` +
    `Generate exactly 3 distinct solution approaches (each with name, summary, pros, cons). ` +
    `Return STRICT JSON only: {"approaches": [{"name":"","summary":"","pros":"","cons":""}]}`,
  );
  let approaches = [];
  try {
    const a = extractJson(appr);
    approaches = (a && Array.isArray(a.approaches))
      ? a.approaches.map(x => typeof x === 'string' ? x : `${x.name}: ${x.summary} (pros: ${x.pros}; cons: ${x.cons})`)
      : [appr.slice(0, 600)];
  } catch { approaches = [appr.slice(0, 600)]; }

  // Stage 3: evaluate & pick best
  const eval_ = runClaude(
    `${ctx}Problem: ${problem}\nApproaches:\n${approaches.join('\n')}\n\n` +
    `Evaluate each approach on feasibility, risk, and completeness. Pick the best one and state WHY. ` +
    `Return STRICT JSON only: {"best_approach": "", "rationale": "", "risks": ["..."], "assumptions": [""]}`,
  );
  let best = '', rationale = '', risks = [], assumptions = [];
  try {
    const e = extractJson(eval_);
    if (e) {
      best        = e.best_approach || '';
      rationale   = e.rationale    || '';
      risks       = Array.isArray(e.risks)       ? e.risks       : [];
      assumptions = Array.isArray(e.assumptions) ? e.assumptions : [];
    }
  } catch {}

  // Stage 4: synthesise concrete solution + verify
  const synth = runClaude(
    `${ctx}Problem: ${problem}\nChosen approach: ${best}\nRationale: ${rationale}\n\n` +
    `Synthesise a final solution. Provide concrete, ordered implementation steps. ` +
    `Self-check: does this solution fully address the original problem? Note any remaining gaps. ` +
    `Return STRICT JSON only: ` +
    `{"solution":"","steps":["..."],"gaps":"","confidence":0.0}`,
  );
  let solution = '', steps = [], confidence = 0.7;
  try {
    const s = extractJson(synth);
    if (s) {
      solution   = s.solution || synth.slice(0, 1000);
      steps      = Array.isArray(s.steps) ? s.steps : [];
      confidence = typeof s.confidence === 'number' ? s.confidence : 0.7;
      if (s.gaps) risks.push('Gap: ' + s.gaps);
    }
  } catch { solution = synth.slice(0, 1000); }

  return {
    ok: true,
    problem,
    approaches,
    solution,
    steps,
    assumptions,
    risks,
    confidence,
  };
}

// ── main ───────────────────────────────────────────────────────────────────────
try {
  const result = mode === 'deep' ? runDeep() : runQuick();
  console.log(JSON.stringify(result));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err.message || err) }));
}
