// engine.mjs — resolve a runnable `claude` (Helm's engine) across platforms, ONE source of truth.
//
// Extracted from index.js so every subsystem (swarm, scheduler, think, mind, research, plan, vision,
// gui, self-upgrade, ...) spawns the engine the SAME correct way instead of duplicating the logic or
// (worse) spawning a bare `claude` that ENOENTs on Windows when CLAUDE_BIN is the npm .cmd/extension-
// less shim. Usage:  const cb = resolveClaude(); spawn(cb.cmd, args, { shell: cb.shell, windowsHide: true })
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// An npm `.cmd` shim just wraps the real claude.exe. Spawning that .cmd through a shell ENOENTs on some
// Windows setups ("The system cannot find the file specified"), so prefer the wrapped .exe — it runs
// directly (shell:false). Returns { cmd, shell }.
export function preferExe(p) {
  if (/\.exe$/i.test(p)) return { cmd: p, shell: false };
  if (/\.cmd$/i.test(p)) {
    const exe = path.join(path.dirname(p), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (existsSync(exe)) return { cmd: exe, shell: false };
    return { cmd: p, shell: true };
  }
  return { cmd: p, shell: true };
}

// Resolve CLAUDE_BIN (or `claude`) to something Node can actually spawn on this OS.
export function resolveClaude() {
  const bin = process.env.CLAUDE_BIN || 'claude';
  if (process.platform !== 'win32') return { cmd: bin, shell: false };
  if (/\.(exe)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: false };
  if (/\.(cmd|bat|ps1)$/i.test(bin) && existsSync(bin)) return preferExe(bin);
  // CLAUDE_BIN points at the extension-less npm shim (...\npm\claude) — use the sibling .exe/.cmd.
  if (existsSync(bin + '.exe')) return { cmd: bin + '.exe', shell: false };
  if (existsSync(bin + '.cmd')) return preferExe(bin + '.cmd');
  // Stale/wrong CLAUDE_BIN: ask Windows where claude actually is.
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
  // `where` failed (detached process / not on PATH) — probe the usual Windows install locations.
  const guesses = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.exe'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.cmd'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'Claude', 'claude.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'),
  ].filter(Boolean);
  for (const g of guesses) if (existsSync(g)) return preferExe(g);
  return { cmd: bin, shell: true };   // last resort: let the shell resolve via PATHEXT
}
