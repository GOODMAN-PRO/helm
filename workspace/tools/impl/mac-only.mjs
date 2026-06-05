export function macOnlyOrExit(toolName) {
  if (process.platform !== 'darwin') {
    console.log(JSON.stringify({
      ok: false,
      error: `${toolName} is macOS-only — it uses AppleScript/Quartz/Vision, which don't exist on ${process.platform}. ` +
             `Use a cross-platform approach instead (shell, files, web, or the cross-platform screenshot tool).`,
      macOnly: true,
    }));
    process.exit(0);
  }
}
