#!/usr/bin/env node
// Prints "ATTACH: /path" to stdout; the Discord bot strips and sends it as a file attachment.
const args = process.argv.slice(2);
const pathIdx = args.indexOf('--path');
const filePath = pathIdx !== -1 ? args[pathIdx + 1] : null;
if (!filePath) { console.error('--path required'); process.exit(1); }
console.log(`ATTACH: ${filePath}`);
