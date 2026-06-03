#!/usr/bin/env node
// image.edit.mjs — image editing for Helm via Windows System.Drawing (PowerShell -EncodedCommand).
//
// Verbs:
//   info     --path <img>
//   resize   --src <img> --out <img> [--width W] [--height H] [--keep-aspect true]
//   crop     --src <img> --out <img> --x N --y N --w N --h N
//   rotate   --src <img> --out <img> --deg 90|180|270
//   flip     --src <img> --out <img> --dir h|v
//   convert  --src <img> --out <img>
//   grayscale --src <img> --out <img>
//   annotate --src <img> --out <img> --text "..." [--x N] [--y N] [--size N] [--color white]
//
// All verbs print exactly ONE JSON object to stdout and exit 0 on success.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const verb = args[0];

// Flag parser — returns the string after --key, or null.
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : null;
};

// Run a PowerShell script via -EncodedCommand (UTF-16 LE base64).
// Stdout is returned as-is; caller parses JSON from it.
function runPs(script, timeoutMs = 30000) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64],
    { encoding: 'utf8', timeout: timeoutMs }
  );
}

// Extract the first JSON object line from PowerShell stdout.
// Add-Type / compilation noise goes to stderr; real output is on stdout.
function parseJsonLine(stdout) {
  const line = (stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('{'));
  if (!line) return null;
  try { return JSON.parse(line); } catch { return null; }
}

function die(msg) {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(0); // always exit 0 per hard rule
}

// Map a file extension to a System.Drawing.Imaging.ImageFormat name.
// Returns null for unknown extensions (caller decides).
function extToFormat(ext) {
  const m = {
    '.png':  'Png',
    '.jpg':  'Jpeg',
    '.jpeg': 'Jpeg',
    '.bmp':  'Bmp',
    '.gif':  'Gif',
    '.tiff': 'Tiff',
    '.tif':  'Tiff',
  };
  return m[ext.toLowerCase()] || null;
}

// Escape single quotes for embedding into a PowerShell single-quoted string context.
// We embed paths inside double-quoted PS strings so we escape $ and " instead.
// Actually we pass paths via PS variables set at the top of each script — no quoting issues.

// Build a PowerShell header that loads System.Drawing and sets $ProgressPreference.
const PS_HEADER = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
`;

// ─── VERB: info ──────────────────────────────────────────────────────────────
if (verb === 'info') {
  const imgPath = get('path');
  if (!imgPath) die('--path required');
  if (!existsSync(imgPath)) die(`file not found: ${imgPath}`);

  const absPath = path.resolve(imgPath).replace(/\\/g, '\\\\');

  const script = `
${PS_HEADER}
$p = "${absPath}"
$bmp = [System.Drawing.Image]::FromFile($p)
$fmt = $bmp.RawFormat
$fmtName = 'unknown'
if ($fmt.Equals([System.Drawing.Imaging.ImageFormat]::Png))  { $fmtName = 'png' }
if ($fmt.Equals([System.Drawing.Imaging.ImageFormat]::Jpeg)) { $fmtName = 'jpeg' }
if ($fmt.Equals([System.Drawing.Imaging.ImageFormat]::Bmp))  { $fmtName = 'bmp' }
if ($fmt.Equals([System.Drawing.Imaging.ImageFormat]::Gif))  { $fmtName = 'gif' }
if ($fmt.Equals([System.Drawing.Imaging.ImageFormat]::Tiff)) { $fmtName = 'tiff' }
$w = $bmp.Width; $h = $bmp.Height
$bmp.Dispose()
$obj = [PSCustomObject]@{ ok=$true; width=$w; height=$h; format=$fmtName; path=$p }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('info failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── VERB: resize ────────────────────────────────────────────────────────────
} else if (verb === 'resize') {
  const src = get('src');
  const out = get('out');
  if (!src) die('--src required');
  if (!out) die('--out required');
  if (!existsSync(src)) die(`src not found: ${src}`);

  const widthArg  = get('width');
  const heightArg = get('height');
  const keepAspect = (get('keep-aspect') || 'true').toLowerCase() !== 'false';

  if (!widthArg && !heightArg) die('--width or --height required');

  const absSrc = path.resolve(src).replace(/\\/g, '\\\\');
  const absOut = path.resolve(out).replace(/\\/g, '\\\\');
  const outFmt  = extToFormat(path.extname(out)) || 'Png';

  // Compute target dimensions in PowerShell (handles keep-aspect logic).
  const widthLine  = widthArg  ? `$reqW = ${parseInt(widthArg, 10)}`  : '$reqW = 0';
  const heightLine = heightArg ? `$reqH = ${parseInt(heightArg, 10)}` : '$reqH = 0';
  const keepLine   = keepAspect ? '$keepAspect = $true' : '$keepAspect = $false';

  const script = `
${PS_HEADER}
$srcPath = "${absSrc}"
$outPath = "${absOut}"
${widthLine}
${heightLine}
${keepLine}

$srcBmp = [System.Drawing.Image]::FromFile($srcPath)
$origW = $srcBmp.Width
$origH = $srcBmp.Height

if ($keepAspect) {
  if ($reqW -gt 0 -and $reqH -gt 0) {
    $scaleW = $reqW / $origW
    $scaleH = $reqH / $origH
    $scale  = [Math]::Min($scaleW, $scaleH)
    $newW   = [int]($origW * $scale)
    $newH   = [int]($origH * $scale)
  } elseif ($reqW -gt 0) {
    $newW = $reqW
    $newH = [int]($origH * ($reqW / $origW))
  } else {
    $newH = $reqH
    $newW = [int]($origW * ($reqH / $origH))
  }
} else {
  $newW = if ($reqW -gt 0) { $reqW } else { $origW }
  $newH = if ($reqH -gt 0) { $reqH } else { $origH }
}

$dst = New-Object System.Drawing.Bitmap($newW, $newH)
$g   = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($srcBmp, 0, 0, $newW, $newH)
$g.Dispose()
$srcBmp.Dispose()

$fmt = [System.Drawing.Imaging.ImageFormat]::${outFmt}
if ("${outFmt}" -eq "Jpeg") {
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $dst.Save($outPath, $jpegCodec, $encParams)
} else {
  $dst.Save($outPath, $fmt)
}
$dst.Dispose()

$obj = [PSCustomObject]@{ ok=$true; src=$srcPath; out=$outPath; originalWidth=$origW; originalHeight=$origH; newWidth=$newW; newHeight=$newH }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('resize failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── VERB: crop ──────────────────────────────────────────────────────────────
} else if (verb === 'crop') {
  const src = get('src');
  const out = get('out');
  const x = get('x');
  const y = get('y');
  const w = get('w');
  const h = get('h');
  if (!src) die('--src required');
  if (!out) die('--out required');
  if (!existsSync(src)) die(`src not found: ${src}`);
  if (x === null || y === null || w === null || h === null) die('--x --y --w --h all required');

  const absSrc = path.resolve(src).replace(/\\/g, '\\\\');
  const absOut = path.resolve(out).replace(/\\/g, '\\\\');
  const outFmt  = extToFormat(path.extname(out)) || 'Png';
  const ix = parseInt(x, 10);
  const iy = parseInt(y, 10);
  const iw = parseInt(w, 10);
  const ih = parseInt(h, 10);

  const script = `
${PS_HEADER}
$srcPath = "${absSrc}"
$outPath = "${absOut}"
$cropX = ${ix}; $cropY = ${iy}; $cropW = ${iw}; $cropH = ${ih}

$srcBmp = [System.Drawing.Bitmap][System.Drawing.Image]::FromFile($srcPath)
$rect   = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$dst    = $srcBmp.Clone($rect, $srcBmp.PixelFormat)
$srcBmp.Dispose()

$fmt = [System.Drawing.Imaging.ImageFormat]::${outFmt}
if ("${outFmt}" -eq "Jpeg") {
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $dst.Save($outPath, $jpegCodec, $encParams)
} else {
  $dst.Save($outPath, $fmt)
}
$dst.Dispose()

$obj = [PSCustomObject]@{ ok=$true; src=$srcPath; out=$outPath; x=$cropX; y=$cropY; w=$cropW; h=$cropH }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('crop failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── VERB: rotate ────────────────────────────────────────────────────────────
} else if (verb === 'rotate') {
  const src = get('src');
  const out = get('out');
  const deg = get('deg');
  if (!src) die('--src required');
  if (!out) die('--out required');
  if (!existsSync(src)) die(`src not found: ${src}`);
  if (!['90', '180', '270'].includes(deg)) die('--deg must be 90, 180, or 270');

  const rotateType = {
    '90':  'Rotate90FlipNone',
    '180': 'Rotate180FlipNone',
    '270': 'Rotate270FlipNone',
  }[deg];

  const absSrc = path.resolve(src).replace(/\\/g, '\\\\');
  const absOut = path.resolve(out).replace(/\\/g, '\\\\');
  const outFmt  = extToFormat(path.extname(out)) || 'Png';

  const script = `
${PS_HEADER}
$srcPath = "${absSrc}"
$outPath = "${absOut}"

$bmp = [System.Drawing.Bitmap][System.Drawing.Image]::FromFile($srcPath)
$bmp.RotateFlip([System.Drawing.RotateFlipType]::${rotateType})

$fmt = [System.Drawing.Imaging.ImageFormat]::${outFmt}
if ("${outFmt}" -eq "Jpeg") {
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $bmp.Save($outPath, $jpegCodec, $encParams)
} else {
  $bmp.Save($outPath, $fmt)
}
$bmp.Dispose()

$obj = [PSCustomObject]@{ ok=$true; src=$srcPath; out=$outPath; deg=${deg} }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('rotate failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── VERB: flip ──────────────────────────────────────────────────────────────
} else if (verb === 'flip') {
  const src = get('src');
  const out = get('out');
  const dir = get('dir');
  if (!src) die('--src required');
  if (!out) die('--out required');
  if (!existsSync(src)) die(`src not found: ${src}`);
  if (!['h', 'v'].includes(dir)) die('--dir must be h or v');

  const flipType = dir === 'h' ? 'RotateNoneFlipX' : 'RotateNoneFlipY';

  const absSrc = path.resolve(src).replace(/\\/g, '\\\\');
  const absOut = path.resolve(out).replace(/\\/g, '\\\\');
  const outFmt  = extToFormat(path.extname(out)) || 'Png';

  const script = `
${PS_HEADER}
$srcPath = "${absSrc}"
$outPath = "${absOut}"

$bmp = [System.Drawing.Bitmap][System.Drawing.Image]::FromFile($srcPath)
$bmp.RotateFlip([System.Drawing.RotateFlipType]::${flipType})

$fmt = [System.Drawing.Imaging.ImageFormat]::${outFmt}
if ("${outFmt}" -eq "Jpeg") {
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $bmp.Save($outPath, $jpegCodec, $encParams)
} else {
  $bmp.Save($outPath, $fmt)
}
$bmp.Dispose()

$obj = [PSCustomObject]@{ ok=$true; src=$srcPath; out=$outPath; dir="${dir}" }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('flip failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── VERB: convert ───────────────────────────────────────────────────────────
} else if (verb === 'convert') {
  const src = get('src');
  const out = get('out');
  if (!src) die('--src required');
  if (!out) die('--out required');
  if (!existsSync(src)) die(`src not found: ${src}`);

  const outFmt = extToFormat(path.extname(out));
  if (!outFmt) die(`unknown output format from extension "${path.extname(out)}"; use .png .jpg .bmp .gif .tiff`);

  const absSrc = path.resolve(src).replace(/\\/g, '\\\\');
  const absOut = path.resolve(out).replace(/\\/g, '\\\\');

  const script = `
${PS_HEADER}
$srcPath = "${absSrc}"
$outPath = "${absOut}"

$srcBmp = [System.Drawing.Image]::FromFile($srcPath)
$srcW   = $srcBmp.Width
$srcH   = $srcBmp.Height

$fmt = [System.Drawing.Imaging.ImageFormat]::${outFmt}
if ("${outFmt}" -eq "Jpeg") {
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $srcBmp.Save($outPath, $jpegCodec, $encParams)
} else {
  $srcBmp.Save($outPath, $fmt)
}
$srcBmp.Dispose()

$obj = [PSCustomObject]@{ ok=$true; src=$srcPath; out=$outPath; format="${outFmt.toLowerCase()}" }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('convert failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── VERB: grayscale ─────────────────────────────────────────────────────────
} else if (verb === 'grayscale') {
  const src = get('src');
  const out = get('out');
  if (!src) die('--src required');
  if (!out) die('--out required');
  if (!existsSync(src)) die(`src not found: ${src}`);

  const absSrc = path.resolve(src).replace(/\\/g, '\\\\');
  const absOut = path.resolve(out).replace(/\\/g, '\\\\');
  const outFmt  = extToFormat(path.extname(out)) || 'Png';

  const script = `
${PS_HEADER}
$srcPath = "${absSrc}"
$outPath = "${absOut}"

$srcBmp = [System.Drawing.Image]::FromFile($srcPath)
$w = $srcBmp.Width; $h = $srcBmp.Height

$dst = New-Object System.Drawing.Bitmap($w, $h)
$g   = [System.Drawing.Graphics]::FromImage($dst)

# ColorMatrix for grayscale (luminosity formula)
$cm = New-Object System.Drawing.Imaging.ColorMatrix
$cm.Matrix00 = 0.299; $cm.Matrix01 = 0.299; $cm.Matrix02 = 0.299
$cm.Matrix10 = 0.587; $cm.Matrix11 = 0.587; $cm.Matrix12 = 0.587
$cm.Matrix20 = 0.114; $cm.Matrix21 = 0.114; $cm.Matrix22 = 0.114
$cm.Matrix33 = 1.0;   $cm.Matrix44 = 1.0

$ia = New-Object System.Drawing.Imaging.ImageAttributes
$ia.SetColorMatrix($cm)

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$g.DrawImage($srcBmp, $rect, 0, 0, $w, $h, [System.Drawing.GraphicsUnit]::Pixel, $ia)
$g.Dispose()
$srcBmp.Dispose()
$ia.Dispose()

$fmt = [System.Drawing.Imaging.ImageFormat]::${outFmt}
if ("${outFmt}" -eq "Jpeg") {
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $dst.Save($outPath, $jpegCodec, $encParams)
} else {
  $dst.Save($outPath, $fmt)
}
$dst.Dispose()

$obj = [PSCustomObject]@{ ok=$true; src=$srcPath; out=$outPath; width=$w; height=$h }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('grayscale failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── VERB: annotate ──────────────────────────────────────────────────────────
} else if (verb === 'annotate') {
  const src   = get('src');
  const out   = get('out');
  const text  = get('text');
  if (!src)  die('--src required');
  if (!out)  die('--out required');
  if (!text) die('--text required');
  if (!existsSync(src)) die(`src not found: ${src}`);

  const tx      = parseInt(get('x')    || '10',    10);
  const ty      = parseInt(get('y')    || '10',    10);
  const tsize   = parseInt(get('size') || '32',    10);
  const tcolor  = get('color') || 'white';

  const absSrc = path.resolve(src).replace(/\\/g, '\\\\');
  const absOut = path.resolve(out).replace(/\\/g, '\\\\');
  const outFmt  = extToFormat(path.extname(out)) || 'Png';

  // Escape the text for embedding into a PowerShell double-quoted string.
  // Replace " with `" and $ with `$.
  const psText = text.replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$');

  // Map color name to System.Drawing.Color — support a handful of common names + hex.
  // PowerShell can use [System.Drawing.Color]::FromName() or [System.Drawing.ColorTranslator]::FromHtml().
  const colorPs = tcolor.startsWith('#')
    ? `[System.Drawing.ColorTranslator]::FromHtml("${tcolor}")`
    : `[System.Drawing.Color]::FromName("${tcolor}")`;

  const script = `
${PS_HEADER}
$srcPath = "${absSrc}"
$outPath = "${absOut}"
$drawText = "${psText}"
$drawX    = ${tx}
$drawY    = ${ty}
$drawSize = ${tsize}

$bmp = [System.Drawing.Bitmap][System.Drawing.Image]::FromFile($srcPath)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$font  = New-Object System.Drawing.Font("Arial", $drawSize, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush(${colorPs})
$g.DrawString($drawText, $font, $brush, [float]$drawX, [float]$drawY)
$font.Dispose()
$brush.Dispose()
$g.Dispose()

$fmt = [System.Drawing.Imaging.ImageFormat]::${outFmt}
if ("${outFmt}" -eq "Jpeg") {
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $bmp.Save($outPath, $jpegCodec, $encParams)
} else {
  $bmp.Save($outPath, $fmt)
}
$bmp.Dispose()

$obj = [PSCustomObject]@{ ok=$true; src=$srcPath; out=$outPath; text=$drawText; x=$drawX; y=$drawY; size=$drawSize }
Write-Output ($obj | ConvertTo-Json -Compress)
`;

  const r = runPs(script);
  const parsed = parseJsonLine(r.stdout);
  if (!parsed) {
    die('annotate failed: ' + ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  }
  console.log(JSON.stringify(parsed));

// ─── UNKNOWN VERB ─────────────────────────────────────────────────────────────
} else {
  die(
    'unknown verb "' + (verb || '') + '". ' +
    'Usage: image.edit.mjs <verb> [flags]\n' +
    'Verbs: info | resize | crop | rotate | flip | convert | grayscale | annotate'
  );
}
