#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32') {
  console.log(JSON.stringify({ ok: false, error: 'uia.* is Windows-only' }));
  process.exit(1);
}




const rawArgs = process.argv.slice(2);


let sub, opts;
const jsonIdx = rawArgs.indexOf('--json');
if (jsonIdx !== -1) {
  let parsed = {};
  try { parsed = JSON.parse(rawArgs[jsonIdx + 1] || '{}'); } catch (e) {
    console.log(JSON.stringify({ ok: false, error: 'bad --json: ' + e.message }));
    process.exit(1);
  }
  sub = parsed.sub || parsed.subcommand || parsed.verb;
  opts = parsed;
} else {
  sub = rawArgs[0];
  const get = (k) => {
    const i = rawArgs.indexOf(`--${k}`);
    return i !== -1 ? rawArgs[i + 1] ?? null : null;
  };
  const has = (k) => rawArgs.includes(`--${k}`);
  opts = {
    title:   get('title'),
    max:     get('max'),
    name:    get('name'),
    role:    get('role'),
    exact:   has('exact'),
  };
}




function runPs(script, timeoutMs = 30_000) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
}




const PS_PREAMBLE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class HelmUIA {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
`.trim();


const PS_VALUE_HELPER = `
function Get-UiaValue($el) {
    try {
        $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($vp) { return $vp.Current.Value }
    } catch {}
    return $null
}
`.trim();


const PS_RECT_HELPER = `
function Convert-Rect($br) {
    # BoundingRectangle uses doubles; Width/Height 0 or huge = offscreen/invisible
    if ($br.Width -le 0 -or $br.Height -le 0) { return $null }
    if ($br.Left -lt -32000 -or $br.Top -lt -32000) { return $null }
    $x = [int][Math]::Round($br.Left)
    $y = [int][Math]::Round($br.Top)
    $w = [int][Math]::Round($br.Width)
    $h = [int][Math]::Round($br.Height)
    $cx = [int][Math]::Round($br.Left + $br.Width / 2)
    $cy = [int][Math]::Round($br.Top + $br.Height / 2)
    return @{ x=$x; y=$y; w=$w; h=$h; cx=$cx; cy=$cy }
}
`.trim();



const PS_ROOT_HELPER = `
function Get-RootElement($titleFilter) {
    $rootEl = $null
    $winTitle = ''
    if ($titleFilter -and $titleFilter -ne '') {
        # Search top-level windows by title substring
        $desktop = [System.Windows.Automation.AutomationElement]::RootElement
        $walker  = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        $child = $walker.GetFirstChild($desktop)
        while ($child -ne $null) {
            try {
                $t = $child.Current.Name
                if ($t -and $t -like ('*' + $titleFilter + '*')) {
                    $rootEl = $child
                    $winTitle = $t
                    break
                }
            } catch {}
            try { $child = $walker.GetNextSibling($child) } catch { break }
        }
        if ($rootEl -eq $null) {
            Write-Output (ConvertTo-Json @{ ok=$false; error=('no top-level window with title matching: ' + $titleFilter) } -Compress)
            exit 0
        }
    } else {
        # Use the foreground window
        $hwnd = [HelmUIA]::GetForegroundWindow()
        if ($hwnd -eq [IntPtr]::Zero) {
            Write-Output (ConvertTo-Json @{ ok=$false; error='no foreground window found' } -Compress)
            exit 0
        }
        try {
            $rootEl = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
        } catch {
            Write-Output (ConvertTo-Json @{ ok=$false; error=('FromHandle failed: ' + $_.Exception.Message) } -Compress)
            exit 0
        }
        $sb = New-Object System.Text.StringBuilder 512
        [HelmUIA]::GetWindowText($hwnd, $sb, 512) | Out-Null
        $winTitle = $sb.ToString()
        if (-not $winTitle) { try { $winTitle = $rootEl.Current.Name } catch {} }
    }
    return @{ el=$rootEl; title=$winTitle }
}
`.trim();




function runTree() {
  const titleFilter = opts.title   || '';
  const maxCount    = parseInt(opts.max || '200', 10) || 200;

  const script = `
${PS_PREAMBLE}
${PS_VALUE_HELPER}
${PS_RECT_HELPER}
${PS_ROOT_HELPER}

try {
    $info = Get-RootElement '${titleFilter.replace(/'/g, "''")}'
    $rootEl = $info.el
    $winTitle = $info.title

    # Get the window bounding rect
    $winRect = $null
    try {
        $wr = $rootEl.Current.BoundingRectangle
        $winRect = Convert-Rect $wr
    } catch {}

    # Depth-first walk via ControlViewWalker, capped at $maxCount elements
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $elements = [System.Collections.Generic.List[object]]::new()
    $stack = [System.Collections.Generic.Stack[object]]::new()
    $stack.Push(@{ el=$rootEl; depth=0 })

    while ($stack.Count -gt 0 -and $elements.Count -lt ${maxCount}) {
        $frame = $stack.Pop()
        $el    = $frame.el
        $depth = $frame.depth

        $name = $null; $ctName = $null; $aid = $null; $enabled = $false; $val = $null; $rect = $null
        try { $name    = $el.Current.Name } catch {}
        try { $ctName  = $el.Current.ControlType.ProgrammaticName } catch {}
        try { $aid     = $el.Current.AutomationId } catch {}
        try { $enabled = $el.Current.IsEnabled } catch {}
        try { $val     = Get-UiaValue $el } catch {}
        try {
            $br   = $el.Current.BoundingRectangle
            $rect = Convert-Rect $br
        } catch {}

        # Strip "ControlType." prefix so callers get "Button" not "ControlType.Button"
        if ($ctName -and $ctName.StartsWith('ControlType.')) { $ctName = $ctName.Substring(12) }

        $entry = @{
            name          = if ($name) { $name } else { '' }
            controlType   = if ($ctName) { $ctName } else { '' }
            automationId  = if ($aid) { $aid } else { '' }
            enabled       = [bool]$enabled
            depth         = $depth
        }
        if ($val -ne $null) { $entry.value = $val }
        if ($rect -ne $null) {
            $entry.rect   = @{ x=$rect.x; y=$rect.y; w=$rect.w; h=$rect.h }
            $entry.center = @{ x=$rect.cx; y=$rect.cy }
        } else {
            $entry.rect   = $null
            $entry.center = $null
        }
        $elements.Add($entry)

        # Push children in reverse order so left-to-right depth-first ordering when popping
        $children = [System.Collections.Generic.List[object]]::new()
        try {
            $child = $walker.GetFirstChild($el)
            while ($child -ne $null) {
                $children.Add($child)
                try { $child = $walker.GetNextSibling($child) } catch { break }
            }
        } catch {}
        for ($i = $children.Count - 1; $i -ge 0; $i--) {
            $stack.Push(@{ el=$children[$i]; depth=($depth + 1) })
        }
    }

    $winRectOut = $null
    if ($winRect) { $winRectOut = @{ x=$winRect.x; y=$winRect.y; w=$winRect.w; h=$winRect.h } }

    $out = @{
        ok      = $true
        window  = @{ title=$winTitle; rect=$winRectOut }
        count   = $elements.Count
        elements = $elements.ToArray()
    }
    Write-Output (ConvertTo-Json $out -Depth 6 -Compress)
} catch {
    Write-Output (ConvertTo-Json @{ ok=$false; error=$_.Exception.Message } -Compress)
}
`.trim();

  const r = runPs(script);
  const raw = (r.stdout || '').trim();
  if (!raw) {
    const errText = (r.stderr || '').trim().slice(0, 400) || 'no output from PowerShell';
    console.log(JSON.stringify({ ok: false, error: errText }));
    process.exit(1);
  }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const jsonLine = lines.reverse().find(l => l.startsWith('{') || l.startsWith('['));
  if (!jsonLine) {
    console.log(JSON.stringify({ ok: false, error: 'no JSON in output: ' + raw.slice(0, 300) }));
    process.exit(1);
  }
  console.log(jsonLine);
}





function makeFindScript(nameFilter, roleFilter, titleFilter, exact) {
  const namePsLit  = (nameFilter  || '').replace(/'/g, "''");
  const rolePsLit  = (roleFilter  || '').replace(/'/g, "''");
  const titlePsLit = (titleFilter || '').replace(/'/g, "''");

  return `
${PS_PREAMBLE}
${PS_VALUE_HELPER}
${PS_RECT_HELPER}
${PS_ROOT_HELPER}

try {
    $info = Get-RootElement '${titlePsLit}'
    $rootEl = $info.el

    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $foundEl    = $null
    $foundEntry = $null
    $bestScore  = 0

    $stack = [System.Collections.Generic.Stack[object]]::new()
    $stack.Push($rootEl)
    $visited = 0

    while ($stack.Count -gt 0 -and $visited -lt 2000) {
        $el = $stack.Pop()
        $visited++

        $name = $null; $ctName = $null; $aid = $null
        try { $name   = $el.Current.Name } catch {}
        try { $ctName = $el.Current.ControlType.ProgrammaticName } catch {}
        try { $aid    = $el.Current.AutomationId } catch {}

        if ($ctName -and $ctName.StartsWith('ControlType.')) { $ctName = $ctName.Substring(12) }

        # Role filter
        $roleOk = $true
        if ('${rolePsLit}' -ne '') {
            $roleOk = ($ctName -and ($ctName -eq '${rolePsLit}'))
        }

        # Score the match: exact Name > Name startsWith > Name contains > exact AutomationId > AutomationId contains.
        # Scanning for the BEST score (not first hit) fixes substring collisions like query "Plus"
        # matching automationId "MemPlus" before the real Name "Plus" operator button.
        $q = '${namePsLit}'
        $score = 0
        if (${exact ? '$true' : '$false'}) {
            if ($name -and ($name -eq $q)) { $score = 100 }
            elseif ($aid -and ($aid -eq $q)) { $score = 50 }
        } else {
            $ql = $q.ToLower()
            if ($name) {
                $nl = $name.ToLower()
                if ($nl -eq $ql) { $score = 100 }
                elseif ($nl.StartsWith($ql)) { $score = 80 }
                elseif ($nl.Contains($ql)) { $score = 60 }
            }
            if ($score -eq 0 -and $aid) {
                $al = $aid.ToLower()
                if ($al -eq $ql) { $score = 50 }
                elseif ($al.Contains($ql)) { $score = 30 }
            }
        }

        if ($roleOk -and $score -gt $bestScore) {
            $enabled = $false; $val = $null; $rect = $null
            try { $enabled = $el.Current.IsEnabled } catch {}
            try { $val     = Get-UiaValue $el } catch {}
            try {
                $br   = $el.Current.BoundingRectangle
                $rect = Convert-Rect $br
            } catch {}

            $entry = @{
                name         = if ($name) { $name } else { '' }
                controlType  = if ($ctName) { $ctName } else { '' }
                automationId = if ($aid) { $aid } else { '' }
                enabled      = [bool]$enabled
            }
            if ($val -ne $null) { $entry.value = $val }
            if ($rect -ne $null) {
                $entry.rect   = @{ x=$rect.x; y=$rect.y; w=$rect.w; h=$rect.h }
                $entry.center = @{ x=$rect.cx; y=$rect.cy }
            } else {
                $entry.rect   = $null
                $entry.center = $null
            }
            $foundEl    = $el
            $foundEntry = $entry
            $bestScore  = $score
            if ($score -ge 100) { break }
        }

        # Push children reverse for depth-first left-to-right
        $children = [System.Collections.Generic.List[object]]::new()
        try {
            $child = $walker.GetFirstChild($el)
            while ($child -ne $null) {
                $children.Add($child)
                try { $child = $walker.GetNextSibling($child) } catch { break }
            }
        } catch {}
        for ($i = $children.Count - 1; $i -ge 0; $i--) {
            $stack.Push($children[$i])
        }
    }
`.trim();
}




function runFind() {
  const nameFilter  = opts.name  || '';
  const roleFilter  = opts.role  || '';
  const titleFilter = opts.title || '';
  const exact       = !!opts.exact;

  if (!nameFilter) {
    console.log(JSON.stringify({ ok: false, error: 'find requires --name <text>' }));
    process.exit(1);
  }

  const script = `
${makeFindScript(nameFilter, roleFilter, titleFilter, exact)}

    if ($foundEntry -ne $null) {
        Write-Output (ConvertTo-Json @{ ok=$true; found=$true; element=$foundEntry } -Depth 5 -Compress)
    } else {
        Write-Output (ConvertTo-Json @{ ok=$true; found=$false } -Compress)
    }
} catch {
    Write-Output (ConvertTo-Json @{ ok=$false; error=$_.Exception.Message } -Compress)
}
`.trim();

  const r = runPs(script);
  const raw = (r.stdout || '').trim();
  if (!raw) {
    const errText = (r.stderr || '').trim().slice(0, 400) || 'no output from PowerShell';
    console.log(JSON.stringify({ ok: false, error: errText }));
    process.exit(1);
  }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const jsonLine = lines.reverse().find(l => l.startsWith('{') || l.startsWith('['));
  if (!jsonLine) {
    console.log(JSON.stringify({ ok: false, error: 'no JSON in output: ' + raw.slice(0, 300) }));
    process.exit(1);
  }
  console.log(jsonLine);
}




function runInvoke() {
  const nameFilter  = opts.name  || '';
  const roleFilter  = opts.role  || '';
  const titleFilter = opts.title || '';
  const exact       = !!opts.exact;

  if (!nameFilter) {
    console.log(JSON.stringify({ ok: false, error: 'invoke requires --name <text>' }));
    process.exit(1);
  }

  const script = `
${makeFindScript(nameFilter, roleFilter, titleFilter, exact)}

    if ($foundEl -eq $null) {
        Write-Output (ConvertTo-Json @{ ok=$true; invoked=$false; found=$false } -Compress)
    } else {
        # Try UIA patterns: Invoke > Toggle > SelectionItem
        $invoked = $false
        $invokeErr = $null
        try {
            $ip = $foundEl.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            if ($ip) { $ip.Invoke(); $invoked = $true }
        } catch { $invokeErr = $_.Exception.Message }
        if (-not $invoked) {
            try {
                $tp = $foundEl.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
                if ($tp) { $tp.Toggle(); $invoked = $true }
            } catch { $invokeErr = $_.Exception.Message }
        }
        if (-not $invoked) {
            try {
                $sp = $foundEl.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                if ($sp) { $sp.Select(); $invoked = $true }
            } catch { $invokeErr = $_.Exception.Message }
        }

        $out = @{
            ok      = $true
            invoked = $invoked
            found   = $true
            element = $foundEntry
            center  = $foundEntry.center
        }
        if (-not $invoked -and $invokeErr) { $out.invokeError = $invokeErr }
        Write-Output (ConvertTo-Json $out -Depth 5 -Compress)
    }
} catch {
    Write-Output (ConvertTo-Json @{ ok=$false; error=$_.Exception.Message } -Compress)
}
`.trim();

  const r = runPs(script);
  const raw = (r.stdout || '').trim();
  if (!raw) {
    const errText = (r.stderr || '').trim().slice(0, 400) || 'no output from PowerShell';
    console.log(JSON.stringify({ ok: false, error: errText }));
    process.exit(1);
  }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const jsonLine = lines.reverse().find(l => l.startsWith('{') || l.startsWith('['));
  if (!jsonLine) {
    console.log(JSON.stringify({ ok: false, error: 'no JSON in output: ' + raw.slice(0, 300) }));
    process.exit(1);
  }
  console.log(jsonLine);
}




if (!sub) {
  console.log(JSON.stringify({ ok: false, error: 'subcommand required: tree | find | invoke' }));
  process.exit(1);
}

switch (sub) {
  case 'tree':   runTree();   break;
  case 'find':   runFind();   break;
  case 'invoke': runInvoke(); break;
  default:
    console.log(JSON.stringify({ ok: false, error: `unknown subcommand: ${sub}. use tree | find | invoke` }));
    process.exit(1);
}
