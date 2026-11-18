#!/usr/bin/env node
// Minimal video pipeline: script -> voice -> visuals -> edit -> render.
// Usage: node scripts/generate.mjs <stage|all>
// Inputs (env): TOPIC, SCRIPT (multi-line text). Output goes to ./output
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "output";
const cfg = JSON.parse(readFileSync("pipeline.config.json", "utf8"));
const stage = process.argv[2] || "all";
mkdirSync(OUT, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const readJson = (f) => JSON.parse(readFileSync(join(OUT, f), "utf8"));

function lines() {
  const raw = (process.env.SCRIPT || "").trim();
  if (!raw) throw new Error("SCRIPT is empty. Pass the workflow input 'script'.");
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
const secsFor = (t) => Math.max(cfg.minSecondsPerLine, t.split(/\s+/).length * cfg.secondsPerWord);

function script() {
  const L = lines();
  const items = L.map((text, i) => ({ i, text, seconds: +secsFor(text).toFixed(2) }));
  writeFileSync(join(OUT, "script.json"), JSON.stringify({ topic: process.env.TOPIC || "", items }, null, 2));
  log(`Script locked: ${items.length} lines, ${items.reduce((a, b) => a + b.seconds, 0).toFixed(1)} s`);
}

async function voice() {
  const { items } = readJson("script.json");
  const p = cfg.voice.provider;
  if (p === "openai" && process.env.OPENAI_API_KEY) {
    const text = items.map((x) => x.text).join(" ");
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.voice.openaiModel, voice: cfg.voice.openaiVoice, input: text, response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
    writeFileSync(join(OUT, "voice.mp3"), Buffer.from(await res.arrayBuffer()));
    log("Voice: generated with OpenAI TTS");
  } else {
    log("Voice: provider 'none' (silent video). Set voice.provider to 'openai' and add OPENAI_API_KEY.");
  }
}

function visuals() {
  const { items } = readJson("script.json");
  const { width: W, height: H, fps, font, fontSize, palette } = cfg;
  items.forEach((it, i) => {
    const [c1, c2] = palette[i % palette.length];
    const txt = join(OUT, `line${i}.txt`);
    // wrap to ~22 chars per row so text fits a 1080 px wide frame
    const wrapped = it.text.replace(/(.{1,22})(\s+|$)/g, "$1\n").trim();
    writeFileSync(txt, wrapped);
    ff([
      "-f", "lavfi", "-i", `gradients=s=${W}x${H}:c0=0x${c1}:c1=0x${c2}:x0=0:y0=0:x1=${W}:y1=${H}:d=${it.seconds}:r=${fps}`,
      "-vf", `drawtext=fontfile=${font}:textfile=${txt}:fontcolor=white:fontsize=${fontSize}:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=0x2146d9@0.0`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(it.seconds), join(OUT, `clip${i}.mp4`),
    ]);
  });
  log(`Visuals: ${items.length} scenes drawn`);
}

function edit() {
  const { items } = readJson("script.json");
  writeFileSync(join(OUT, "concat.txt"), items.map((_, i) => `file 'clip${i}.mp4'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", join(OUT, "concat.txt"), "-c", "copy", join(OUT, "edited.mp4")]);
  log("Edit: scenes joined");
}

function render() {
  const a = join(OUT, "voice.mp3");
  const args = ["-i", join(OUT, "edited.mp4")];
  if (existsSync(a)) args.push("-i", a, "-map", "0:v", "-map", "1:a", "-shortest");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (existsSync(a)) args.push("-c:a", "aac");
  args.push(join(OUT, "video.mp4"));
  ff(args);
  const { items } = readJson("script.json");
  writeFileSync(join(OUT, "run.json"), JSON.stringify({ topic: process.env.TOPIC || "", lines: items.length, createdAt: new Date().toISOString(), file: "video.mp4" }, null, 2));
  log("Render: output/video.mp4 ready");
}

const table = { script, voice, visuals, edit, render };
const order = ["script", "voice", "visuals", "edit", "render"];
try {
  for (const s of stage === "all" ? order : [stage]) {
    if (!table[s]) throw new Error(`Unknown stage '${s}'`);
    await table[s]();
  }
} catch (e) {
  console.error("::error::" + e.message);
  process.exit(1);
}
