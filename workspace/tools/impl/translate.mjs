#!/usr/bin/env node
import { spawnSync }   from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';


const args = process.argv.slice(2);
const get  = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };

const textArg  = get('text');
const filePath = get('file');
const toLang   = get('to');
const fromLang = get('from');
const formalRaw= get('formal');
const outPath  = get('out');

const out = (o) => { console.log(JSON.stringify(o)); process.exit(0); };
const fail = (m) => out({ ok: false, error: m });


if (!toLang) fail('--to <language> is required');

let sourceText = '';

if (filePath) {
  let raw;
  try { raw = readFileSync(filePath, 'utf8'); } catch (e) { fail(`cannot read file: ${e.message}`); }

  sourceText = raw.slice(0, 12_000);
} else if (textArg) {
  sourceText = textArg;
} else {
  fail('provide --text "<...>" or --file <path>');
}

if (!sourceText.trim()) fail('source text is empty');


const formalTag = formalRaw === 'true'
  ? 'Use a formal register (professional, polite, no contractions).'
  : formalRaw === 'false'
    ? 'Use an informal/casual register.'
    : '';   // omit register instruction; default natural

const autoDetectNote = fromLang
  ? `The source language is ${fromLang}.`
  : 'Detect the source language automatically.';

// The prompt is engineered to return ONLY the translation on line 1, then the
// detected source language label on line 2 (format "SOURCE_LANG: <name>").
// This keeps parsing trivial without a JSON parse step.
const prompt = [
  `You are a professional translator with native fluency in all major world languages.`,
  ``,
  `Task: Translate the text below into ${toLang}.`,
  autoDetectNote,
  formalTag,
  ``,
  `STRICT OUTPUT FORMAT — follow exactly, nothing else:`,
  `Line 1: the complete translation (and ONLY the translation — no preamble, no quotes, no`,
  `         "Here is the translation:", no explanation, no trailing comment).`,
  `Line 2: SOURCE_LANG: <detected or confirmed source language name in English>`,
  ``,
  `Text to translate:`,
  sourceText,
].filter(l => l !== null).join('\n');


let raw;
try {
  const r = spawnSync('claude', ['-p', prompt], { encoding: 'utf8', timeout: 120_000 });
  if (r.error) throw new Error(`claude exec failed: ${r.error.message}`);
  raw = (r.stdout || '').trim();
} catch (e) {
  fail(`claude call failed: ${e.message}`);
}

if (!raw) fail('claude returned empty output');



const sourceLangMarker = 'SOURCE_LANG:';
const markerIdx = raw.lastIndexOf(sourceLangMarker);

let translated;
let detectedFrom;

if (markerIdx !== -1) {

  const translationPart = raw.slice(0, markerIdx).trimEnd();
  const langPart        = raw.slice(markerIdx + sourceLangMarker.length).trim().split('\n')[0].trim();

  translated   = translationPart;
  detectedFrom = langPart || (fromLang || 'unknown');
} else {

  translated   = raw;
  detectedFrom = fromLang || 'unknown';
}



const firstLine = translated.split('\n')[0];
if (/^(here is|voici|aquí está|ecco|hier ist|これは|이것은)/i.test(firstLine)) {
  translated = translated.split('\n').slice(1).join('\n').trimStart();
}

translated = translated.trim();

if (!translated) fail('translation result was empty after parsing');


if (outPath) {
  try { writeFileSync(outPath, translated, 'utf8'); } catch (e) { fail(`cannot write --out file: ${e.message}`); }
}


out({
  ok:         true,
  translated,
  from:       detectedFrom,
  to:         toLang,
  chars:      translated.length,
});
