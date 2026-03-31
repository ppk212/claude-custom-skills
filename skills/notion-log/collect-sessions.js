import "dotenv/config";
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { execFileSync } from "child_process";

const CLAUDE_DIR = join(process.env.HOME, ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

// --date YYYY-MM-DD 옵션 지원
const dateArgIdx = process.argv.indexOf("--date");
const TARGET_DATE =
  dateArgIdx !== -1 && process.argv[dateArgIdx + 1]
    ? process.argv[dateArgIdx + 1]
    : new Date().toISOString().split("T")[0];

// --- 오늘 날짜의 모든 세션 JSONL 파일 찾기 ---

function findTodaySessionFiles() {
  const sessions = [];
  const projectDirs = readdirSync(PROJECTS_DIR);

  for (const projDir of projectDirs) {
    const projPath = join(PROJECTS_DIR, projDir);
    if (!statSync(projPath).isDirectory()) continue;

    // 프로젝트 경로 복원: -Users-ethan-lee-... → /Users/ethan.lee/...
    const cwd = projDir.replace(/-/g, "/");

    const files = readdirSync(projPath).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const filePath = join(projPath, file);
      const stat = statSync(filePath);
      const modDate = stat.mtime.toISOString().split("T")[0];

      if (modDate === TARGET_DATE) {
        sessions.push({ filePath, cwd, sessionId: file.replace(".jsonl", "") });
      }
    }
  }

  return sessions;
}

// --- JSONL에서 user/assistant 대화 추출 ---

function parseSession(filePath) {
  const lines = readFileSync(filePath, "utf-8").trim().split("\n");
  const conversations = [];
  let sessionCwd = null;
  let sessionTimestamp = null;

  // user → assistant 페어 만들기
  let pendingUser = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // cwd 추출 (첫 번째 것 사용)
      if (!sessionCwd && entry.cwd) {
        sessionCwd = entry.cwd;
      }
      if (!sessionTimestamp && entry.timestamp) {
        sessionTimestamp = entry.timestamp;
      }

      if (entry.type === "user" && entry.message?.content) {
        const content = entry.message.content;
        // content가 string이면 그대로, array면 text만 추출
        let text;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
        }
        if (text && text.trim()) {
          // system-reminder, command 태그 제거
          text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
          text = text.replace(/<command-message>[\s\S]*?<\/command-message>/g, "").trim();
          text = text.replace(/<command-name>[\s\S]*?<\/command-name>/g, "").trim();
          if (text) pendingUser = text;
        }
      }

      if (entry.type === "assistant" && entry.message?.content && pendingUser) {
        const content = entry.message.content;
        let texts = [];
        if (Array.isArray(content)) {
          texts = content
            .filter((c) => c.type === "text")
            .map((c) => c.text);
        }
        const assistantText = texts.join("\n").trim();
        if (assistantText) {
          conversations.push({
            user: pendingUser,
            assistant: assistantText,
          });
          pendingUser = null;
        }
      }
    } catch (e) {
      // skip invalid lines
    }
  }

  return { conversations, cwd: sessionCwd, timestamp: sessionTimestamp };
}

// --- 메인 ---

const sessionFiles = findTodaySessionFiles();
console.log(`📋 오늘(${TARGET_DATE}) 세션 ${sessionFiles.length}개 발견`);

const allSessions = [];

for (const sf of sessionFiles) {
  // subagent 세션은 건너뛰기
  if (sf.filePath.includes("/subagents/")) continue;

  const parsed = parseSession(sf.filePath);
  if (parsed.conversations.length === 0) continue;

  allSessions.push({
    sessionId: sf.sessionId,
    cwd: parsed.cwd || sf.cwd,
    timestamp: parsed.timestamp,
    conversations: parsed.conversations,
  });

  console.log(
    `  📝 ${sf.sessionId.slice(0, 8)}... (${parsed.cwd || sf.cwd}) — ${parsed.conversations.length}개 대화`
  );
}

if (allSessions.length === 0) {
  console.log("오늘 기록할 세션이 없습니다.");
  process.exit(0);
}

// 시간순 정렬
allSessions.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));

// JSON 출력 (log-from-file.js에서 사용할 수 있는 포맷)
const output = {
  date: TARGET_DATE,
  sessions: allSessions.map((s) => ({
    sessionId: s.sessionId,
    cwd: s.cwd,
    conversationCount: s.conversations.length,
    conversations: s.conversations,
  })),
};

const outputPath = `/tmp/notion-sessions-${TARGET_DATE}.json`;
writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`\n💾 세션 데이터 저장: ${outputPath}`);
console.log(`총 ${allSessions.reduce((sum, s) => sum + s.conversations.length, 0)}개 대화`);
