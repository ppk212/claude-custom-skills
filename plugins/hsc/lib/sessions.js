// Claude Code 세션 기록(~/.claude/projects/**/*.jsonl)을 읽어 "사용자 질문 → Claude 답변" 쌍으로 만든다.
// notion-log(날짜별 수집)와 digest(키워드 검색)가 같이 쓴다.
import { readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
export const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

const pad = (n) => String(n).padStart(2, "0");

// 로컬 시간대 기준 날짜. toISOString()은 UTC라 한국에서는 00~09시 대화가 전날로 잡힌다.
export function localDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function startOfLocalDay(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// 프로젝트 폴더 바로 아래의 세션 파일만 (서브에이전트 기록은 <sid>/subagents/ 아래라 제외된다)
export function listSessionFiles({ modifiedSince = 0 } = {}) {
  const out = [];
  let dirs = [];
  try {
    dirs = readdirSync(PROJECTS_DIR);
  } catch {
    return out;
  }
  for (const dir of dirs) {
    const projPath = join(PROJECTS_DIR, dir);
    let files;
    try {
      if (!statSync(projPath).isDirectory()) continue;
      files = readdirSync(projPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const filePath = join(projPath, f);
      const mtime = statSync(filePath).mtimeMs;
      if (mtime >= modifiedSince) out.push({ filePath, sessionId: f.replace(/\.jsonl$/, ""), mtime });
    }
  }
  return out;
}

const NOISE_TAGS = /<(system-reminder|command-message|command-name|command-args|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g;

// 사람이 직접 입력한 메시지만 (tool_result, 자동 주입, 요약 메시지 제외)
function userText(entry) {
  if (entry.type !== "user" || entry.isMeta || entry.isCompactSummary || entry.isSidechain) return null;
  const c = entry.message?.content;
  let text;
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b.type === "tool_result")) return null;
    text = c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  if (!text) return null;
  text = text.replace(NOISE_TAGS, "").trim();
  if (!text || text.startsWith("Caveat:") || text.startsWith("[Request interrupted")) return null;
  return text;
}

function assistantText(entry) {
  if (entry.type !== "assistant" || entry.isSidechain) return null;
  const c = entry.message?.content;
  if (!Array.isArray(c)) return null;
  const t = c.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return t || null;
}

// 한 세션을 대화 쌍 목록으로. 한 질문에 대한 Claude의 텍스트 응답은 여러 메시지로 나뉘어 오므로
// 다음 질문이 나올 때까지 모두 이어 붙인다 (첫 조각만 쓰면 최종 정리가 빠진다).
// date를 주면 그 날(로컬) 시작된 대화만 남긴다.
export function readConversations(filePath, { date } = {}) {
  let cwd = null;
  let startedAt = null;
  const convs = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.assistant.length) convs.push({ user: cur.user, assistant: cur.assistant.join("\n\n"), at: cur.at });
    cur = null;
  };

  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!cwd && e.cwd) cwd = e.cwd;
    if (!startedAt && e.timestamp) startedAt = e.timestamp;
    const u = userText(e);
    if (u) {
      flush();
      cur = { user: u, assistant: [], at: e.timestamp || null };
      continue;
    }
    const a = assistantText(e);
    if (a && cur) cur.assistant.push(a);
  }
  flush();

  const conversations = date ? convs.filter((c) => c.at && localDate(c.at) === date) : convs;
  return { cwd, startedAt, conversations };
}

export function projectName(cwd) {
  return (cwd || "").split("/").filter(Boolean).pop() || cwd || "unknown";
}
