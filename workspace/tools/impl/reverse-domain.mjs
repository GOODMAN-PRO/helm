#!/usr/bin/env node
import { fileURLToPath } from 'node:url';





function depUniverse(findings) {
  const f = findings || {};
  const e = f.electron || {};
  const names = new Set();
  const add = obj => { if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) names.add(String(k).toLowerCase()); };
  add(e.dependencies); add(e.devDependencies);
  for (const r of (e.mainRequires || [])) names.add(String(r).toLowerCase());
  for (const s of (e.bundleSignals || [])) names.add(String(s).toLowerCase());
  for (const s of (f.subsystems || [])) names.add(String(s).toLowerCase());

  for (const ep of ((f.code && f.code.endpoints) || [])) names.add(String(ep).toLowerCase());
  for (const s of (f.services || [])) names.add(String(s.name || '').toLowerCase());
  return names;
}

// Does any dependency name contain one of these needles?
const hasAny = (universe, needles) => needles.some(n => [...universe].some(d => d.includes(n)));
// Return the first matching needle (for naming what we found).
const firstHit = (universe, needles) => { for (const n of needles) { for (const d of universe) if (d.includes(n)) return n; } return null; };

function docTypeStrings(findings) {
  const caps = (findings && findings.capabilities) || {};
  return (caps.documentTypes || []).map(d => (typeof d === 'string' ? d : (d && (d.name || d.type)) || '')).filter(Boolean);
}

function textBlob(findings) {
  const f = findings || {};
  const app = f.app || {};
  return [app.name, app.productName, app.description, f.displayName, f.label, app.homepage,
    ...(f.features || []), (f.content && f.content.caption), (f.content && f.content.type)]
    .filter(Boolean).join(' ').toLowerCase();
}

// ---- editor / storage / capability signatures ---------------------------------------------------

const EDITOR_ENGINES = [
  { needles: ['codemirror'], name: 'CodeMirror', kind: 'a code/text editor component (Markdown-friendly)' },
  { needles: ['prosemirror', 'tiptap'], name: 'ProseMirror/Tiptap', kind: 'a structured rich-text editor' },
  { needles: ['lexical'], name: 'Lexical', kind: "Meta's extensible rich-text framework" },
  { needles: ['slate-react', 'slate'], name: 'Slate', kind: 'a customizable rich-text framework' },
  { needles: ['quill'], name: 'Quill', kind: 'a rich-text (Delta) editor' },
  { needles: ['draft-js', 'draftjs'], name: 'Draft.js', kind: "Facebook's rich-text editor" },
  { needles: ['monaco'], name: 'Monaco', kind: 'the VS Code editor engine' },
  { needles: ['ace-builds', 'brace'], name: 'Ace', kind: 'a code editor component' },
];
const MARKDOWN_LIBS = ['markdown', 'remark', 'markdown-it', 'marked', 'unified', 'micromark', 'mdast', 'rehype', 'commonmark'];
const DB_LIBS = [
  { needles: ['better-sqlite3', 'sqlite3', 'sql.js', 'sqlite'], name: 'SQLite' },
  { needles: ['leveldown', 'level', 'leveldb', 'classic-level'], name: 'LevelDB' },
  { needles: ['pouchdb'], name: 'PouchDB (syncable)' },
  { needles: ['lowdb'], name: 'LowDB (JSON)' },
  { needles: ['realm'], name: 'Realm' },
  { needles: ['indexeddb', 'dexie', 'idb'], name: 'IndexedDB' },
];
const SYNC_REALTIME = ['yjs', 'automerge', 'sharedb', 'liveblocks'];
const SYNC_NET = ['socket.io', 'websocket', ' ws@', 'ws', 'pusher', 'ably', 'partykit'];
const CLOUD_SDK = ['aws-sdk', '@aws-sdk', 'dropbox', 'googleapis', '@google-cloud', 'firebase', 'supabase', 'icloud', '@azure'];
const SEARCH_LIBS = ['lunr', 'flexsearch', 'minisearch', 'orama', 'fuse.js', 'fusejs', 'elasticlunr', 'meilisearch'];
const CRYPTO_LIBS = ['libsodium', 'tweetnacl', 'crypto-js', 'node-forge', 'openpgp', 'sjcl', 'age-encryption'];
const AI_LIBS = ['openai', '@anthropic', 'anthropic', 'langchain', 'llama', '@huggingface', 'ai-sdk', 'ollama'];
const FILE_WATCH = ['chokidar', 'fs-extra', 'fswatcher', 'gaze', 'watchpack'];






const KNOWN_APPS = [
  { match: /\bobsidian\b|md\.obsidian/i, category: 'note-taking',
    mech: { format: 'markdown-files', storage: 'local-files', editor: 'CodeMirror', linking: true, plugins: true, search: 'built-in', collaboration: null, cloudSync: null },
    note: 'Obsidian stores each note as a local **Markdown file** in a "vault" folder on disk (no lock-in — readable/editable outside the app). Notes connect via `[[wiki-links]]` with backlinks and a graph view. It is extended through a large community **plugin** ecosystem. Live multi-user collaboration is not built in; cross-device **Sync** and **Publish** are paid add-ons, not part of the core app.',
    design: 'Minimal, content-first and keyboard-driven, with a quiet chrome that gets out of the way. Dark theme by default. The whole UI is rearrangeable **panes** (split/stack/tab) with collapsible left/right sidebars. Deeply customizable through community themes and CSS snippets — it can look like almost anything.',
    signature: [
      '**Graph view** — the signature feature: every note is a **node (an orb)** and every `[[link]]` between notes is an **edge (a string)** connecting them; pan/zoom an interactive force-directed graph of the whole vault (global graph) or just one note\'s neighbours (local graph), with color groups, filters and physics controls. THIS is "every folder/note is an orb connected with a string."',
      '**Canvas** — an infinite spatial whiteboard where notes, cards, images and media are placed freely and connected with arrows/edges.',
      '**Bidirectional links & backlinks** — `[[wiki-links]]` with autocomplete; a backlinks pane shows every note linking here, plus "unlinked mentions".',
      '**Live Preview** editing (Markdown renders inline as you type) plus a separate Reading view and raw source mode.',
      '**Command palette** (Cmd/Ctrl-P) and fully remappable hotkeys — most actions are keyboard-first.',
      '**Panes / tabs / split view** — open many notes side by side; drag to split; stack tabs.',
      '**Community plugins + themes** — a large ecosystem that adds features (calendar, Dataview queries, Kanban, etc.) and reskins the app.',
      'Daily notes, tags, outline, search, bookmarks, and quick switcher.',
    ] },
  { match: /\blogseq\b/i, category: 'note-taking',
    mech: { format: 'markdown-files', storage: 'local-files', editor: 'CodeMirror', linking: true, plugins: true },
    note: 'Logseq is an outliner that stores notes as local Markdown/Org files, block-referenced, with bidirectional links and a graph; plugin-extensible.',
    design: 'Outliner-first: everything is a nestable bullet/block. Clean, slightly playful; light/dark themes; left sidebar for journals/pages, right sidebar for linked references.',
    signature: [
      '**Graph view** — pages are nodes (orbs) and links are edges (strings), like Obsidian.',
      '**Block references & embeds** — link/transclude individual blocks, not just pages.',
      '**Journals / daily notes** as the default capture surface.',
      '**Queries** (Datalog) and a plugin ecosystem.',
    ] },
  { match: /\bbear\b/i, category: 'note-taking',
    mech: { format: 'database', storage: 'local-db', collaboration: null },
    note: 'Bear stores notes in a local SQLite database and syncs across Apple devices via iCloud (CloudKit); Markdown-style markup, tag-based organization.' },
  { match: /\bnotion\b/i, category: 'note-taking',
    mech: { format: 'database', storage: 'cloud', collaboration: 'yjs', cloudSync: 'built-in', search: 'built-in' },
    note: 'Notion stores content as cloud-hosted block trees (server is the source of truth); real-time multi-user collaboration and cross-device sync are built in; offline support is limited.',
    design: 'Clean, modern, whitespace-heavy editorial look. Everything is a draggable **block**; a slash (/) menu inserts content types. Left sidebar tree of pages/workspaces; light default with subtle accents.',
    signature: [
      '**Block-based editor** — every paragraph, heading, image, toggle, etc. is a movable block; `/` command menu to insert.',
      '**Databases** — tables/boards/calendars/galleries with the same data viewed many ways; relations & rollups.',
      '**Real-time collaboration** — multiplayer cursors, comments, mentions, sharing/permissions.',
      'Templates, synced blocks, and an API/integrations ecosystem.',
    ] },
  { match: /\bjoplin\b/i, category: 'note-taking',
    mech: { format: 'hybrid', storage: 'local-db', search: 'built-in', plugins: true },
    note: 'Joplin keeps notes as Markdown in a local SQLite store and syncs to your choice of backend (Dropbox/OneDrive/WebDAV/Joplin Cloud); supports end-to-end encryption and plugins.' },
  { match: /com\.apple\.notes|^notes$/i, category: 'note-taking',
    mech: { format: 'database', storage: 'local-db', cloudSync: 'built-in' },
    note: 'Apple Notes stores notes in a local Core Data/SQLite store and syncs via iCloud; rich text + attachments; optional per-note locking (encryption).' },
  { match: /onenote/i, category: 'note-taking',
    mech: { format: 'database', storage: 'cloud', cloudSync: 'built-in', collaboration: 'built-in' },
    note: 'OneNote stores notebooks in the cloud (OneDrive) with freeform pages; real-time collaboration and sync built in.' },
  { match: /evernote/i, category: 'note-taking',
    mech: { format: 'database', storage: 'cloud', cloudSync: 'built-in', search: 'built-in' },
    note: 'Evernote stores notes in its cloud with a local cache; strong search (incl. OCR of images); web clipper.' },
  { match: /\broam\b/i, category: 'note-taking',
    mech: { format: 'database', storage: 'cloud', linking: true, collaboration: 'built-in' },
    note: 'Roam Research is a cloud outliner built around bidirectional links and block references; collaborative graphs.' },
  { match: /visual studio code|com\.microsoft\.vscode|\bvscode\b/i, category: 'code-editor', mech: {}, note: 'VS Code is an Electron code editor built on the Monaco engine, with an extension marketplace and integrated terminal.' },
];

function knownApp(findings) {
  try {
    const f = findings || {};
    const app = f.app || {};
    const hay = [app.name, app.productName, f.displayName, f.label, f.bundleId, app.homepage].filter(Boolean).join(' ');
    for (const k of KNOWN_APPS) if (k.match.test(hay)) return k;
    return null;
  } catch { return null; }
}



export function classifyDomain(findings) {
  try {
    const f = findings || {};
    const blob = textBlob(f);
    const docs = docTypeStrings(f).join(' ').toLowerCase();
    const uni = depUniverse(f);
    const category = (cat, confidence, signals) => ({ category: cat, confidence, signals });


    const known = knownApp(f);
    if (known) return category(known.category, 'high', ['recognized app (known behavior on record)']);


    let noteScore = 0; const noteSignals = [];
    if (/\b(note|notes|notebook|knowledge|wiki|second brain|markdown|zettel|journal|memo|outliner)\b/.test(blob)) { noteScore += 2; noteSignals.push('name/description mentions notes/knowledge'); }
    if (/\b(public\.app-category\.productivity)\b/.test(((f.capabilities && f.capabilities.category) || '').toLowerCase())) { noteScore += 1; noteSignals.push('category: productivity'); }
    if (/(\.md\b|markdown|\.txt\b|public\.text|net\.daringfireball\.markdown|\.rtf\b)/.test(docs)) { noteScore += 2; noteSignals.push('opens text/Markdown documents'); }
    if (EDITOR_ENGINES.some(e => hasAny(uni, e.needles))) { noteScore += 2; noteSignals.push('bundles a text/rich-text editor engine'); }
    if (hasAny(uni, MARKDOWN_LIBS)) { noteScore += 1; noteSignals.push('uses a Markdown parser'); }

    const looksIDE = /\b(ide|code editor|programming|terminal|debugger)\b/.test(blob) || hasAny(uni, ['monaco']);


    let codeScore = 0; const codeSignals = [];
    if (hasAny(uni, ['monaco'])) { codeScore += 2; codeSignals.push('bundles the Monaco (VS Code) editor'); }
    if (/\b(code|ide|developer|programming|terminal|git)\b/.test(blob)) { codeScore += 1; codeSignals.push('developer-tool wording'); }
    if (hasAny(uni, ['xterm', 'node-pty'])) { codeScore += 2; codeSignals.push('embeds a terminal (xterm/node-pty)'); }


    let chatScore = 0; const chatSignals = [];
    if (/\b(chat|messaging|messenger|im\b)\b/.test(blob)) { chatScore += 2; chatSignals.push('chat/messaging wording'); }
    if (hasAny(uni, SYNC_REALTIME) || hasAny(uni, SYNC_NET)) { chatScore += 1; chatSignals.push('real-time transport'); }

    let mediaScore = 0; const mediaSignals = [];
    if (/\b(music|video|player|stream|podcast|media)\b/.test(blob)) { mediaScore += 2; mediaSignals.push('media wording'); }

    const scored = [
      { c: 'note-taking', s: looksIDE ? noteScore - 2 : noteScore, sig: noteSignals },
      { c: 'code-editor', s: codeScore, sig: codeSignals },
      { c: 'chat', s: chatScore, sig: chatSignals },
      { c: 'media-player', s: mediaScore, sig: mediaSignals },
    ].sort((a, b) => b.s - a.s);

    const top = scored[0];
    if (!top || top.s < 3) return category('unknown', 0, []);
    const confidence = top.s >= 5 ? 'high' : top.s >= 4 ? 'medium' : 'low';
    return category(top.c, confidence, top.sig);
  } catch { return { category: 'unknown', confidence: 0, signals: [] }; }
}



function analyzeNoteTaking(findings) {
  const f = findings || {};
  const uni = depUniverse(f);
  const docs = docTypeStrings(f);
  const lines = [];
  const known = knownApp(f);
  const mech = { ...(known && known.mech ? known.mech : {}) };

  lines.push('## How It Takes Notes', '');
  if (known && known.note) lines.push(`- **Known behavior:** ${known.note}`);

  // Editor engine — what you actually type into.
  const engine = EDITOR_ENGINES.find(e => hasAny(uni, e.needles)) || (mech.editor ? { name: mech.editor, kind: 'the app\'s editor component' } : null);
  if (engine) { mech.editor = engine.name; lines.push(`- **Editor engine:** ${engine.name} — ${engine.kind}. This is the component you type into and what defines the editing model (plain-text/Markdown vs. structured rich-text).`); }
  else lines.push('- **Editor engine:** not identified from dependencies — the editor may be custom or in an unparsed bundle.');


  const usesMarkdown = hasAny(uni, MARKDOWN_LIBS) || docs.some(d => /md|markdown|text/i.test(d));
  const db = DB_LIBS.find(d => hasAny(uni, d.needles));
  if (usesMarkdown && db) mech.format = 'hybrid';
  else if (db) mech.format = 'database';
  else if (usesMarkdown) mech.format = 'markdown-files';
  if (mech.format === 'markdown-files') lines.push('- **Note format:** plain **Markdown / text files** — each note is a portable file you can read, edit, back up or grep outside the app. No proprietary lock-in.');
  else if (mech.format === 'database') lines.push(`- **Note format:** an embedded **${(db && db.name) || 'database'}** — notes live in an app-managed store rather than individual files (faster queries, but less portable / harder to read without the app).`);
  else if (mech.format === 'hybrid') lines.push(`- **Note format:** hybrid — Markdown content with a${db ? ` ${db.name}` : ' database'} index/cache for fast lookup.`);
  else lines.push('- **Note format:** not determinable from this bundle (the app may load its content/editor code from outside the analyzed bundle).');


  const watchesFiles = hasAny(uni, FILE_WATCH) || (f.electron && (f.electron.mainRequires || []).some(r => /\bfs\b/.test(r)));
  if (!mech.storage) {
    if (mech.format === 'markdown-files' || watchesFiles) mech.storage = 'local-files';
    else if (db) mech.storage = 'local-db';
  }
  if (mech.storage === 'local-files') lines.push('- **Storage location:** a **local folder/vault** on disk, so notes are offline-first and live on your own machine.');
  else if (mech.storage === 'local-db') lines.push('- **Storage location:** a local app database (offline-capable).');
  else if (mech.storage === 'cloud') lines.push('- **Storage location:** **cloud-hosted** — the vendor’s server is the source of truth; your notes live on their servers and offline use is limited.');


  const blob = textBlob(f);
  if (mech.linking || /\b(wiki|backlink|link|graph|zettel|second brain)\b/.test(blob) || hasAny(uni, ['wikilink', 'backlink'])) { mech.linking = true; lines.push('- **Linking/organization:** note-to-note links (wiki-style `[[links]]` / backlinks / graph) — knowledge-base oriented.'); }


  const realtime = firstHit(uni, SYNC_REALTIME);
  const cloud = firstHit(uni, CLOUD_SDK);
  const net = firstHit(uni, SYNC_NET);
  if (realtime) mech.collaboration = realtime;
  if (cloud) mech.cloudSync = cloud;
  if (mech.collaboration) lines.push(`- **Collaboration:** real-time multi-user editing${typeof mech.collaboration === 'string' && /yjs|automerge|sharedb/i.test(mech.collaboration) ? ` via a CRDT/OT layer (\`${mech.collaboration}\`)` : ''} — concurrent edits merge.`);
  if (mech.cloudSync) lines.push(`- **Sync:** built-in cross-device sync${typeof mech.cloudSync === 'string' && mech.cloudSync !== 'built-in' ? ` (\`${mech.cloudSync}\`)` : ''}.`);
  else if (net && !realtime) lines.push(`- **Networking:** a realtime transport (\`${net}\`) is bundled (could be sync, live preview, or telemetry).`);


  const search = firstHit(uni, SEARCH_LIBS);
  if (search) mech.search = search;
  if (mech.search) lines.push(`- **Search:** in-app full-text search${typeof mech.search === 'string' && mech.search !== 'built-in' ? ` (\`${mech.search}\` index)` : ''}.`);


  const pluginish = mech.plugins || (f.subsystems || []).some(s => /plugin/i.test(String(s))) || hasAny(uni, ['plugin']);
  if (pluginish) { mech.plugins = true; lines.push('- **Extensibility:** a plugin/extension system — third-party code can add features (also widens the attack surface).'); }

  lines.push('');
  return { lines, mech };
}

// Capability gap analysis: check presence/absence of the capabilities a modern note app is expected to
// have, and frame absences as gaps/opportunities. Evidence-based (reasons from detected dependencies),
// and explicit that "not detected" means "not found in the analyzed bundle", not a hard guarantee.
function noteGaps(findings, mech) {
  const uni = depUniverse(findings);
  const has = needles => hasAny(uni, needles);
  const checks = [
    { area: 'Encryption at rest', present: has(CRYPTO_LIBS), note: 'notes appear stored unencrypted — fine for portability, but a gap if the device is shared/lost; an at-rest encryption option would close it.' },
    { area: 'Real-time collaboration', present: has(SYNC_REALTIME) || !!mech.collaboration, note: 'no CRDT/OT library detected — multi-user live editing is missing; a Yjs/Automerge layer would add it.' },
    { area: 'Built-in cloud sync', present: has(CLOUD_SDK) || has(['pouchdb']) || !!mech.cloudSync, note: 'no cloud-sync SDK in the core bundle — cross-device sync likely relies on a paid add-on or a third-party folder (Dropbox/iCloud).' },
    { area: 'Full-text search', present: has(SEARCH_LIBS) || mech.search, note: 'no dedicated search index library detected — search may be slow/linear on large vaults; a FlexSearch/Orama index would scale it.' },
    { area: 'Extensibility / plugins', present: !!mech.plugins, note: 'no obvious plugin system — features are fixed; a plugin API would let the community extend it.' },
    { area: 'AI / LLM features', present: has(AI_LIBS), note: 'no AI/LLM dependency detected — no built-in summarize/ask/autocomplete; an opportunity given the app already holds the user’s knowledge.' },
    { area: 'Version history', present: has(['isomorphic-git', 'nodegit', 'simple-git', 'diff-match-patch']), note: 'no versioning/diff library detected — no built-in note history/undo-across-sessions; Git-backed history is a common gap-filler.' },
    { area: 'Web/clipper capture', present: has(['readability', 'turndown', 'mercury', 'puppeteer']), note: 'no web-capture/HTML→Markdown library detected — no built-in web clipper to save pages as notes.' },
  ];
  return checks;
}



export function domainAnalysis(findings, kind = 'app') {
  try {
    const dom = classifyDomain(findings);
    const out = { domain: dom };
    const lines = [];

    if (dom.category === 'unknown') return { lines: [], findings: { domain: dom } };

    lines.push(`## Domain — ${dom.category.replace('-', ' ')} (${dom.confidence} confidence)`);
    if (dom.signals && dom.signals.length) lines.push(`_Detected from: ${dom.signals.join('; ')}._`);
    lines.push('');

    if (dom.category === 'note-taking') {
      const { lines: mechLines, mech } = analyzeNoteTaking(findings);
      lines.push(...mechLines);
      out.noteMechanics = mech;

      const gaps = noteGaps(findings, mech);
      out.gaps = gaps;
      lines.push('## Gaps & Opportunities', '');
      lines.push('_Based on capabilities detected (or not) in the analyzed bundle — "not detected" means it was not found here, not that it is impossible via add-ons._', '');
      const present = gaps.filter(g => g.present);
      const missing = gaps.filter(g => !g.present);
      if (missing.length) { lines.push('**Gaps / opportunities:**'); for (const g of missing) lines.push(`- **${g.area}:** ${g.note}`); lines.push(''); }
      if (present.length) { lines.push('**Already covered:**'); for (const g of present) lines.push(`- ${g.area}`); lines.push(''); }
    } else {
      // Generic gap analysis for other recognized categories (lighter).
      const uni = depUniverse(findings);
      const has = n => hasAny(uni, n);
      const gaps = [
        { area: 'Encryption at rest', present: has(CRYPTO_LIBS) },
        { area: 'Cloud sync', present: has(CLOUD_SDK) },
        { area: 'Real-time collaboration', present: has(SYNC_REALTIME) },
        { area: 'AI / LLM features', present: has(AI_LIBS) },
        { area: 'Full-text search', present: has(SEARCH_LIBS) },
      ];
      out.gaps = gaps;
      const missing = gaps.filter(g => !g.present);
      if (missing.length) { lines.push('## Gaps & Opportunities', '', '_Capabilities not detected in the analyzed bundle:_'); for (const g of missing) lines.push(`- ${g.area}`); lines.push(''); }
    }

    // Design language + signature features (the actual look & feel — e.g. Obsidian's graph view).
    const known = knownApp(findings);
    if (known && (known.design || (known.signature && known.signature.length))) {
      out.designLanguage = known.design || null;
      out.signature = known.signature || [];
      lines.push('## Design & Signature Features', '');
      if (known.design) lines.push(`**Design language.** ${known.design}`, '');
      if (known.signature && known.signature.length) {
        lines.push('**Signature features (what makes it recognizable):**');
        for (const s of known.signature) lines.push(`- ${s}`);
        lines.push('');
      }
    }

    return { lines, findings: out };
  } catch { return { lines: [], findings: {} }; }
}

// ---- self-test -----------------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = {
    app: { name: 'obsidian', description: 'Obsidian — a knowledge base on local Markdown files', homepage: 'https://obsidian.md' },
    capabilities: { category: 'public.app-category.productivity', documentTypes: ['public.data', 'net.daringfireball.markdown'] },
    electron: { dependencies: { codemirror: '6', 'markdown-it': '13', '@electron/remote': '2', chokidar: '3' }, mainRequires: ['fs', 'path'] },
    subsystems: ['plugin host', 'electron remote bridge'],
  };
  const r = domainAnalysis(fixture, 'app');
  console.log('classify:', JSON.stringify(classifyDomain(fixture)));
  console.log('\n' + r.lines.join('\n'));
  console.log('\nempty-safe:', JSON.stringify(domainAnalysis({}, 'app')));
}
