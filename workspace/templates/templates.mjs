#!/usr/bin/env node
// Helm templates — export your Helm's *flavor* as a shareable file others can import.
// A template captures the safe-to-share config that defines how a Helm looks and behaves:
// persona/style, gateways, model, permission mode, and free MCP tools. It NEVER includes
// secrets, tokens, the owner's identity, private memory, or the vault.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));   // workspace/templates
const ROOT = path.resolve(DIR, '../..');                    // secondme/
const TPL_EXT = '.helmtemplate.json';
const PERSONA_FILE = path.join(ROOT, 'workspace', 'persona.local.md');
const SERVERS = path.join(ROOT, 'workspace', 'mcp', 'servers.json');
const ENV = path.join(ROOT, '.env');
const ROOT_TOKEN = '__HELM_ROOT__';
const FREE_SERVERS = ['filesystem', 'fetch', 'playwright'];   // no-credential, safe to share

function readEnvVal(key) { try { const m = readFileSync(ENV, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm')); return m ? m[1].trim() : ''; } catch { return ''; } }
function readServers() { try { return JSON.parse(readFileSync(SERVERS, 'utf8')); } catch { return { mcpServers: {} }; } }

export function exportTemplate(name, description = '') {
  name = (name || '').replace(/[^\w.-]/g, '_') || 'helm-template';
  const servers = readServers().mcpServers || {};
  const safe = {}; const optional = [];
  for (const [k, v] of Object.entries(servers)) {
    if (!FREE_SERVERS.includes(k)) { optional.push(k); continue; }   // credential-gated -> just name it
    const copy = JSON.parse(JSON.stringify(v));
    // Tokenize the install root so the template is portable. servers.json may carry a path
    // from a DIFFERENT machine than the one exporting (e.g. a Mac path on Windows), so match
    // the local ROOT first, then tokenize any remaining absolute path (it can only be the
    // install root for these free servers) — a shared template must never leak an absolute path.
    const isAbs = s => /^([A-Za-z]:[\\/]|\/)/.test(s);
    copy.args = (copy.args || []).map(a => {
      if (typeof a !== 'string') return a;
      if (a === ROOT || a.startsWith(ROOT + '/') || a.startsWith(ROOT + '\\')) return a.split(ROOT).join(ROOT_TOKEN);
      return isAbs(a) ? ROOT_TOKEN : a;
    });
    delete copy.healthCheck;
    safe[k] = copy;
  }
  const tpl = {
    helmTemplate: 1,
    name, description: description || '',
    createdAt: new Date().toISOString(),
    persona: existsSync(PERSONA_FILE) ? readFileSync(PERSONA_FILE, 'utf8').slice(0, 4000) : '',
    gateways: readEnvVal('GATEWAYS') || 'discord',
    model: readEnvVal('MODEL') || 'sonnet',
    permissionMode: readEnvVal('PERMISSION_MODE') || 'bypassPermissions',
    mcpServers: safe,
    optionalServers: optional,
  };
  mkdirSync(DIR, { recursive: true });
  const out = path.join(DIR, name + TPL_EXT);
  writeFileSync(out, JSON.stringify(tpl, null, 2));
  return out;
}

export function listTemplates() {
  try { return readdirSync(DIR).filter(f => f.endsWith(TPL_EXT)).map(f => f.replace(TPL_EXT, '')); } catch { return []; }
}

export function importTemplate(file) {
  let p = file;
  if (!existsSync(p)) { const c = path.join(DIR, file.endsWith(TPL_EXT) ? file : file + TPL_EXT); if (existsSync(c)) p = c; }
  if (!existsSync(p)) throw new Error('template not found: ' + file);
  const tpl = JSON.parse(readFileSync(p, 'utf8'));
  if (tpl.helmTemplate !== 1) throw new Error('not a Helm template (v1)');
  const applied = [];
  if (tpl.persona && tpl.persona.trim()) { writeFileSync(PERSONA_FILE, tpl.persona); applied.push('persona/style'); }
  if (tpl.mcpServers && Object.keys(tpl.mcpServers).length) {
    const cur = readServers(); cur.mcpServers = cur.mcpServers || {};
    for (const [k, v] of Object.entries(tpl.mcpServers)) {
      const copy = JSON.parse(JSON.stringify(v));
      copy.args = (copy.args || []).map(a => typeof a === 'string' ? a.split(ROOT_TOKEN).join(ROOT) : a);
      // merge so existing local fields (healthCheck, enabled) survive; only command/args are updated
      cur.mcpServers[k] = { ...(cur.mcpServers[k] || {}), ...copy };
    }
    writeFileSync(SERVERS, JSON.stringify(cur, null, 2));
    applied.push('MCP tools: ' + Object.keys(tpl.mcpServers).join(', '));
  }
  return {
    name: tpl.name, description: tpl.description || '', applied,
    suggests: { gateways: tpl.gateways, model: tpl.model },
    optionalServers: tpl.optionalServers || [],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'export') console.log('wrote ' + exportTemplate(rest[0], rest.slice(1).join(' ')));
  else if (cmd === 'list') { const l = listTemplates(); console.log(l.length ? l.join('\n') : '(no templates)'); }
  else if (cmd === 'import') {
    const r = importTemplate(rest[0]);
    console.log(`imported ${r.name}: ${r.applied.join('; ') || 'nothing'}`);
    console.log(`suggests gateways=${r.suggests.gateways} model=${r.suggests.model}`);
    if (r.optionalServers.length) console.log('optional (need your own keys): ' + r.optionalServers.join(', '));
  } else console.log('usage: templates.mjs export <name> [description] | list | import <file|name>');
}
