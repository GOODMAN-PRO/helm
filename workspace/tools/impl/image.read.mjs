#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const get = k => { const i = args.indexOf(`--${k}`); return i !== -1 ? args[i + 1] : null; };
const imgPath = get('path') || get('image') || get('out');
const question = get('question');
let mode = (get('mode') || 'auto').toLowerCase();

if (!imgPath) { console.error('--path <image file> required'); process.exit(1); }
if (!existsSync(imgPath)) { console.error('no such file: ' + imgPath); process.exit(1); }


if (mode === 'auto') mode = (process.env.AUTH_MODE === 'custom') ? 'ocr' : 'engine';


function claudeCmd() {
  const bin = process.env.CLAUDE_BIN || 'claude';
  if (process.platform !== 'win32') return { cmd: bin, shell: false };
  if (/\.exe$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: false };
  if (/\.(cmd|bat)$/i.test(bin) && existsSync(bin)) return { cmd: bin, shell: true };
  if (existsSync(bin + '.exe')) return { cmd: bin + '.exe', shell: false };
  if (existsSync(bin + '.cmd')) return { cmd: bin + '.cmd', shell: true };
  return { cmd: bin, shell: true };
}

function viaEngine() {
  const prompt = [
    `Use your Read tool to open the image at this path: ${imgPath}`,
    'Then analyze it thoroughly and report:',
    '1. What the image shows (scene, objects, app/UI, layout).',
    '2. ALL visible text, transcribed verbatim (signs, labels, documents, code, handwriting).',
    '3. Any diagrams, charts, tables, math or figures — interpret what they mean.',
    question ? `\nThen answer this about the image: ${question}` : '',
    '\nBe accurate and complete; do not guess at unreadable parts — say "unclear".',
  ].filter(Boolean).join('\n');
  const c = claudeCmd();
  const r = spawnSync(c.cmd, [
    '-p', '--output-format', 'json', '--model', 'sonnet',
    '--permission-mode', 'bypassPermissions',
    '--add-dir', path.dirname(path.resolve(imgPath)),
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--max-turns', '4',
  ], { input: prompt, encoding: 'utf8', timeout: 180_000, shell: c.shell });
  if (r.status !== 0) throw new Error((r.stderr || '').slice(0, 400) || 'engine vision failed');
  let out = (r.stdout || '').trim();
  try { out = JSON.parse(out).result ?? out; } catch {}
  return out;
}

// OCR fallback (text only) for backends that can't see images. Best-effort, cross-platform.
function viaOcr() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const macOcr = path.resolve(__dirname, '../../..', 'bin', 'ocr-helper');
  if (process.platform === 'darwin' && existsSync(macOcr)) {
    const r = spawnSync(macOcr, [imgPath], { encoding: 'utf8', timeout: 30_000 });
    if (r.status === 0 && (r.stdout || '').trim()) return r.stdout.trim();
  }
  // Windows: Windows.Media.Ocr via a tiny PowerShell (WinRT). Available on Win10+.
  if (process.platform === 'win32') {
    const ps = [
      '$ErrorActionPreference="Stop"',
      '$f=Get-Item -LiteralPath "' + imgPath.replace(/"/g, '`"') + '"',
      'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
      '$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|?{$_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation`1"})[0]',
      'function Await($o,$t){$m=$asTask.MakeGenericMethod($t);$tk=$m.Invoke($null,@($o));$tk.Wait();$tk.Result}',
      '[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]|Out-Null',
      '$sf=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])',
      '$stream=Await ($sf.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])',
      '[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]|Out-Null',
      '$dec=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])',
      '$bmp=Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])',
      '[Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]|Out-Null',
      '$eng=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()',
      '$res=Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])',
      'Write-Output $res.Text',
    ].join('\n');
    const b64 = Buffer.from(ps, 'utf16le').toString('base64');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8', timeout: 40_000 });
    if (r.status === 0 && (r.stdout || '').trim()) return r.stdout.trim();
  }
  // Anywhere: tesseract if installed.
  const t = spawnSync('tesseract', [imgPath, 'stdout'], { encoding: 'utf8', timeout: 40_000 });
  if (t.status === 0 && (t.stdout || '').trim()) return t.stdout.trim();
  throw new Error('no OCR available — install tesseract, or use a Claude (multimodal) backend for full image understanding');
}

try {
  const text = mode === 'ocr' ? viaOcr() : viaEngine();
  console.log(JSON.stringify({ ok: true, mode, path: imgPath, text }));
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
