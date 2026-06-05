#!/usr/bin/env node
const args = process.argv.slice(2);
const pathIdx = args.indexOf('--path');
const filePath = pathIdx !== -1 ? args[pathIdx + 1] : null;
if (!filePath) { console.error('--path required'); process.exit(1); }
console.log(`ATTACH: ${filePath}`);
