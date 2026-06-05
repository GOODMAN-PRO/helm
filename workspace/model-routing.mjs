import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREF_FILE = path.join(__dirname, 'model-pref');
const VALID_MODELS = ['haiku', 'sonnet', 'opus'];




const OPUS_RX = /\b(build|implement|debug|refactor|deploy|architect|rewrite|scaffold|develop)\b|\bwrite (code|a function|a class|a module|a script|a test|the code)\b|\bfix (the |a |this )?(bug|error|crash|issue|problem)\b|(create|make|add)\b.{0,30}\b(app|feature|component|api|endpoint|bot|tool|server|cli|plugin|extension|command|handler|route)\b/i;


const HAIKU_RX = /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|ping|stop|cancel)\b|^(what time|what day|who is|when is|where is)\b/i;

let anchorEmbeddings = null;
const HAIKU_ANCHORS = [
  "hello", "hi", "how are you", "thanks", "what time is it", "status of the bot", "cancel the current task"
];
const SONNET_ANCHORS = [
  "explain quantum computing in simple terms", "write an essay about climate change",
  "what are the main differences between Python and Javascript", "give me a recipe for chocolate chip cookies",
  "how do I organize a project plan"
];
const OPUS_ANCHORS = [
  "write a python script to parse logs and handle exceptions",
  "there is a bug in my typescript code: it throws a null pointer exception, let's fix it",
  "implement a new REST api route using express that queries the sqlite database",
  "refactor this React component to use hooks and optimize performance",
  "write unit tests for this class and configure the github action pipeline",
  "help me build a command line interface to manage tasks"
];

let embedPromise = null;
function getEmbedModule() {
  if (!embedPromise) {
    embedPromise = import('./memory/embed.mjs').catch(() => null);
  }
  return embedPromise;
}


export async function classifyComplexity(text) {
  const t = (text || '').trim();
  const len = t.length;

  // Very long messages are complex enough for opus
  if (len > 1000) return 'opus';


  if (OPUS_RX.test(t)) return 'opus';


  if (len < 50) return 'haiku';


  if (HAIKU_RX.test(t)) return 'haiku';

  try {
    const embedMod = await getEmbedModule();
    if (embedMod && await embedMod.ensurePipelineLoaded()) {
      if (!anchorEmbeddings) {
        const haikuVecs = await Promise.all(HAIKU_ANCHORS.map(a => embedMod.embedText(a)));
        const sonnetVecs = await Promise.all(SONNET_ANCHORS.map(a => embedMod.embedText(a)));
        const opusVecs = await Promise.all(OPUS_ANCHORS.map(a => embedMod.embedText(a)));
        anchorEmbeddings = { haiku: haikuVecs, sonnet: sonnetVecs, opus: opusVecs };
      }

      const inputVec = await embedMod.embedText(t);
      const maxSim = vecs => {
        let max = -1;
        for (const v of vecs) {
          const sim = embedMod.cosineSimilarity(inputVec, v);
          if (sim > max) max = sim;
        }
        return max;
      };

      const haikuScore = maxSim(anchorEmbeddings.haiku);
      const sonnetScore = maxSim(anchorEmbeddings.sonnet);
      const opusScore = maxSim(anchorEmbeddings.opus);

      if (opusScore > sonnetScore && opusScore > haikuScore) {
        return 'opus';
      } else if (sonnetScore > haikuScore) {
        return 'sonnet';
      } else {
        return 'haiku';
      }
    }
  } catch (e) {

  }


  return 'sonnet';
}


export function getModelPref() {
  try {
    const v = readFileSync(PREF_FILE, 'utf8').trim().toLowerCase();
    return VALID_MODELS.includes(v) ? v : null;
  } catch { return null; }
}



export function setModelPref(name) {
  const n = (name || '').trim().toLowerCase();
  if (n === 'auto' || n === '') {
    writeFileSync(PREF_FILE, 'auto');
    return 'auto';
  }
  if (!VALID_MODELS.includes(n)) {
    throw new Error(`Unknown model "${name}". Valid: ${VALID_MODELS.join(', ')}, auto`);
  }
  writeFileSync(PREF_FILE, n);
  return n;
}
