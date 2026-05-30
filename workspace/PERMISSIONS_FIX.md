# Mac permissions Helm needs

The Discord bot is launched by launchd (`~/Library/LaunchAgents/com.helm.discord.plist`) as
`/Users/owner/.local/bin/node`. macOS attaches Screen Recording and Accessibility
permissions to the **binary that posts events / captures pixels**, which is node — not
zsh, not Terminal.

## What's broken

- `screencapture -x /tmp/sm-screen.png` → `could not create image from display`
  - Root cause: the node binary does not have Screen Recording permission.
- `guicontrol move/click/type` may silently no-op without Accessibility permission.
  - The Swift binary calls CGEvent post; macOS requires the *parent process* (node) to be in
    the Accessibility list.

## Fix (one-time, owner does this)

1. System Settings → Privacy & Security → **Screen Recording** → click `+`
   → press ⌘⇧G, paste `/Users/owner/.local/bin/node`, add it. Toggle on.
2. Same panel → **Accessibility** → repeat with the same node binary.
3. Restart the bot so the new permission is picked up:
   ```
   launchctl kickstart -k gui/$(id -u)/com.helm.discord
   ```
4. From Helm, run a quick screenshot test to confirm:
   ```
   screencapture -x /tmp/sm-screen.png && ls -la /tmp/sm-screen.png
   ```

## Quick verification I can do

- guicontrol existence: yes, `/Users/owner/secondme/bin/guicontrol` is built and executable.
- guicontrol smoke test (`move 100 100`): exits 0. Doesn't prove events landed — only that the
  binary ran. Real confirmation needs a visible cursor jump.
