#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(os.homedir(), ".helm-video-cache");


await fs.mkdir(CACHE_DIR, { recursive: true });

const server = new Server(
  { name: "helm-video-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);


const tools = [
  {
    name: "video.download",
    description:
      "Download a video/reel from YouTube, Instagram, TikTok, X, or other platforms. Returns local file path.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the video/reel to download",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "video.frames",
    description:
      "Extract N frames from a video file at regular intervals. Returns paths to extracted frame images.",
    inputSchema: {
      type: "object",
      properties: {
        videoPath: {
          type: "string",
          description: "Path to the video file (local path)",
        },
        numFrames: {
          type: "number",
          description: "Number of frames to extract (default: 8)",
        },
      },
      required: ["videoPath"],
    },
  },
  {
    name: "video.transcribe",
    description:
      "Extract and transcribe audio from a video using Whisper. Returns transcript text.",
    inputSchema: {
      type: "object",
      properties: {
        videoPath: {
          type: "string",
          description: "Path to the video file",
        },
        language: {
          type: "string",
          description: "Language code (e.g., 'en' for English, auto-detect if omitted)",
        },
      },
      required: ["videoPath"],
    },
  },
  {
    name: "video.watch",
    description:
      "Full video analysis: download, extract frames, transcribe audio. Returns integrated summary.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the video/reel",
        },
        numFrames: {
          type: "number",
          description: "Number of frames to extract (default: 6)",
        },
      },
      required: ["url"],
    },
  },
];


function run(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} failed: ${stderr}`));
    });
  });
}


async function downloadVideo(url) {
  const filename = `video-${Date.now()}.mp4`;
  const outputPath = path.join(CACHE_DIR, filename);

  try {
    await run("yt-dlp", [
      "-f",
      "best",
      "-o",
      outputPath,
      url,
    ]);
    return outputPath;
  } catch (err) {
    throw new Error(`Failed to download video: ${err.message}`);
  }
}


async function extractFrames(videoPath, numFrames = 8) {
  const basename = path.basename(videoPath, path.extname(videoPath));
  const frameDir = path.join(CACHE_DIR, `frames-${basename}-${Date.now()}`);
  await fs.mkdir(frameDir, { recursive: true });

  try {
    const framePattern = path.join(frameDir, "frame-%03d.png");
    await run("ffmpeg", [
      "-i",
      videoPath,
      "-vf",
      `fps=1/${Math.ceil(300 / numFrames)}`,
      "-vframes",
      numFrames.toString(),
      framePattern,
    ]);

    const frames = await fs.readdir(frameDir);
    return frames
      .sort()
      .map((f) => path.join(frameDir, f))
      .slice(0, numFrames);
  } catch (err) {
    throw new Error(`Failed to extract frames: ${err.message}`);
  }
}


async function transcribeAudio(videoPath, language = "en") {
  const basename = path.basename(videoPath, path.extname(videoPath));
  const audioPath = path.join(CACHE_DIR, `audio-${basename}-${Date.now()}.mp3`);

  try {

    await run("ffmpeg", ["-i", videoPath, "-q:a", "9", "-n", audioPath]);


    let cmd = ["whisper", audioPath, "--output_format", "txt", "--output_dir", CACHE_DIR];
    if (language) cmd.push("--language", language);

    await run("whisper", cmd.slice(1));

    const txtPath = audioPath.replace(/\.mp3$/, ".txt");
    const transcript = await fs.readFile(txtPath, "utf-8");
    return transcript;
  } catch (err) {
    throw new Error(`Failed to transcribe: ${err.message}`);
  }
}


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    let result;
    switch (name) {
      case "video.download":
        result = await downloadVideo(args.url);
        return { content: [{ type: "text", text: `Downloaded to: ${result}` }] };

      case "video.frames":
        const frames = await extractFrames(args.videoPath, args.numFrames || 8);
        return {
          content: [
            {
              type: "text",
              text: `Extracted ${frames.length} frames:\n${frames.join("\n")}`,
            },
          ],
        };

      case "video.transcribe":
        const transcript = await transcribeAudio(
          args.videoPath,
          args.language
        );
        return { content: [{ type: "text", text: transcript }] };

      case "video.watch":
        const videoPath = await downloadVideo(args.url);
        const watchFrames = await extractFrames(videoPath, args.numFrames || 6);
        const watchTranscript = await transcribeAudio(videoPath, "en");
        return {
          content: [
            {
              type: "text",
              text: `Video: ${args.url}\nFrames: ${watchFrames.join(
                "\n"
              )}\n\nTranscript:\n${watchTranscript}`,
            },
          ],
        };

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }] };
  }
});


server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});


const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Video MCP server running...");
