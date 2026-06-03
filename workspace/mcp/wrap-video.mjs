#!/usr/bin/env node

import { spawn } from "child_process";
import { execSync } from "child_process";
import os from "os";

// Ensure Python user bin and ~/bin are on PATH
const extraPaths = [
  `${os.homedir()}/bin`,
  `${os.homedir()}/Library/Python/3.9/bin`,
  `${os.homedir()}/Library/Python/3.10/bin`,
  `${os.homedir()}/Library/Python/3.11/bin`,
].join(":");
process.env.PATH = `${extraPaths}:${process.env.PATH}`;

// Check for required dependencies
const deps = ["yt-dlp", "ffmpeg", "whisper"];
const missing = [];

for (const dep of deps) {
  try {
    execSync(`which ${dep}`, { stdio: "ignore" });
  } catch {
    missing.push(dep);
  }
}

if (missing.length > 0) {
  console.error(
    `❌ Video server: missing dependencies: ${missing.join(", ")}`
  );
  console.error(
    "Install via: brew install yt-dlp ffmpeg && pip install openai-whisper"
  );
  process.exit(1);
}

// Spawn the video server
const server = spawn("node", [
  new URL("./video-server.mjs", import.meta.url).pathname,
]);

process.stdin.pipe(server.stdin);
server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);

server.on("error", (err) => {
  console.error("Video server error:", err);
  process.exit(1);
});

server.on("close", (code) => {
  process.exit(code || 0);
});
