import "../lib/env-notion-log.js";
import { readFileSync } from "fs";

// Read data from JSON file
const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node log-from-file.js <json-file-path>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(filePath, "utf-8"));
const { summary, details, conversations, topics, cwd } = data;

// Build CLI args
const args = [
  "index.js", "log",
  "--summary", summary || "Claude Code 세션",
  "--details", details || "",
];

if (conversations && conversations.length > 0) {
  args.push("--conversations", JSON.stringify(conversations));
}
if (topics && topics.length > 0) {
  args.push("--topics", JSON.stringify(topics));
}
if (cwd) {
  args.push("--cwd", cwd);
}

import { execFileSync } from "child_process";
const result = execFileSync("node", args, {
  cwd: new URL(".", import.meta.url).pathname,
  encoding: "utf-8",
  maxBuffer: 10 * 1024 * 1024,
});
console.log(result);
