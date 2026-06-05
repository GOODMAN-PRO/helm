#!/usr/bin/env node
import { winInput } from './win-input.mjs';

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const combo = get('combo') || args.find((a) => !a.startsWith('--'));
if (!combo) { console.error('gui.hotkey needs --combo (e.g. ctrl+c, alt+tab, win+r)'); process.exit(1); }
if (process.platform !== 'win32') { console.error('gui.hotkey is Windows-only here (macOS: use gui.key with modifiers)'); process.exit(1); }

const r = winInput({ verb: 'hotkey', combo });
if (!r.ok) { console.error(r.error || 'hotkey failed'); process.exit(1); }
console.log(JSON.stringify({ ok: true, combo }));
