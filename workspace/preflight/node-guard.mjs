// node-guard — Helm needs Node >=22.5.0 for the built-in `node:sqlite` module.
//
// The catch: on older Node, `import 'node:sqlite'` throws ERR_UNKNOWN_BUILTIN_MODULE at *link time*,
// before any code in that file runs — so a guard inside index.js can't help. Instead, the entry points
// that do NOT statically import node:sqlite (the `helm` launcher, the wizard, `helm doctor`) import THIS
// module first and call assertNode(), turning a cryptic crash into a clear, actionable message.

export const MIN_NODE = [22, 5, 0];

export function nodeParts(v = process.versions.node) {
  return String(v).split('.').map(n => parseInt(n, 10) || 0);
}

// true if the running Node is >= min (default 22.5.0)
export function nodeOk(min = MIN_NODE) {
  const [a, b, c] = nodeParts();
  const [x, y, z] = min;
  if (a !== x) return a > x;
  if (b !== y) return b > y;
  return c >= z;
}

export function nodeHint() {
  const want = MIN_NODE.join('.');
  const lines = [
    `Helm needs Node ${want} or newer — you have ${process.versions.node}.`,
    `It uses Node's built-in SQLite (node:sqlite), which only exists from Node 22.5.`,
    ``,
    `Fix (any one):`,
    `  - Windows:  winget install OpenJS.NodeJS.LTS    (or download from https://nodejs.org)`,
    `  - macOS:    nvm install --lts                   (or download from https://nodejs.org)`,
    `  - Linux:    nvm install --lts                   (or your distro's nodesource 22.x)`,
    `Then CLOSE and reopen your terminal and run Helm again.`,
  ];
  return lines.join('\n');
}

// Print a clear message and exit if Node is too old. Returns true otherwise.
export function assertNode() {
  if (nodeOk()) return true;
  process.stderr.write('\n' + nodeHint() + '\n\n');
  process.exit(70);
}
