// Shared guard for tools that depend on macOS-only facilities (AppleScript/osascript, Quartz event
// injection, Finder/Messages/Calendar apps, the Vision OCR framework). On any other OS these can't
// work, so the tool exits cleanly with a clear message instead of crashing with `spawn ... ENOENT`.
// Usage (top of a mac-only impl):  import './mac-only.mjs' is NOT enough — call macOnlyOrExit('name').
export function macOnlyOrExit(toolName) {
  if (process.platform !== 'darwin') {
    console.log(JSON.stringify({
      ok: false,
      error: `${toolName} is macOS-only — it uses AppleScript/Quartz/Vision, which don't exist on ${process.platform}. ` +
             `Use a cross-platform approach instead (shell, files, web, or the cross-platform screenshot tool).`,
      macOnly: true,
    }));
    process.exit(0);   // exit 0 so the caller treats it as a handled "unavailable", not a hard failure
  }
}
