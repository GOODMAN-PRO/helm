import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';




export function preferExe(p) {
  if (/\.exe$/i.test(p)) return { cmd: p, shell: false };
  if (/\.cmd$/i.test(p)) {
    const exe = path.join(path.dirname(p), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (existsSync(exe)) return { cmd: exe, shell: false };
    return { cmd: p, shell: true };
  }
  return { cmd: p, shell: true };
}


export function resolveClaude() {
  const bin = process.env.CLAUDE_BIN || 'claude';
  if (process.platform !== 'win32') return { cmd: bin, shell: false };
  if (/\.(exe)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: false };
  if (/\.(cmd|bat|ps1)$/i.test(bin) && existsSync(bin)) return preferExe(bin);

  if (existsSync(bin + '.exe')) return { cmd: bin + '.exe', shell: false };
  if (existsSync(bin + '.cmd')) return preferExe(bin + '.cmd');

  try {
    const r = spawnSync('where', ['claude'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const hits = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const exe = hits.find(h => /\.exe$/i.test(h));
      const cmd = hits.find(h => /\.cmd$/i.test(h));
      if (exe) return { cmd: exe, shell: false };
      if (cmd) return preferExe(cmd);
    }
  } catch {}

  const guesses = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.exe'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.cmd'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'Claude', 'claude.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'),
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return preferExe(g);
  return { cmd: bin, shell: true };
}
