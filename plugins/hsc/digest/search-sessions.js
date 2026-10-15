import "../lib/env-digest.js";
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const CLAUDE_DIR = join(process.env.HOME, ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

// --query "검색어" 옵션
const queryArgIdx = process.argv.indexOf("--query");
const QUERY = queryArgIdx !== -1 && process.argv[queryArgIdx + 1]
  ? process.argv[queryArgIdx + 1]
  : null;

if (!QUERY) {
  console.error("Usage: node search-sessions.js --query \"검색어\"");
  process.exit(1);
}

const keywords = QUERY.toLowerCase().split(/\s+/);

// --- 모든 세션 JSONL 파일 찾기 ---

function findAllSessionFiles() {
  const sessions = [];
  const projectDirs = readdirSync(PROJECTS_DIR);

  for (const projDir of projectDirs) {
    const projPath = join(PROJECTS_DIR, projDir);
    if (!statSync(projPath).isDirectory()) continue;

    const files = readdirSync(projPath).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const filePath = join(projPath, file);
      // subagent 세션 건너뛰기
      if (filePath.includes("/subagents/")) continue;
      sessions.push({ filePath, sessionId: file.replace(".jsonl", "") });
    }
  }

  return sessions;
}

// --- JSONL에서 관련 대화 검색 ---

function searchSession(filePath, keywords) {
  const lines = readFileSync(filePath, "utf-8").trim().split("\n");
  const conversations = [];
  let sessionCwd = null;
  let sessionDate = null;
  let pendingUser = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      if (!sessionCwd && entry.cwd) sessionCwd = entry.cwd;
      if (!sessionDate && entry.timestamp) {
        sessionDate = entry.timestamp.split("T")[0];
      }

      if (entry.type === "user" && entry.message?.content) {
        const content = entry.message.content;
        let text;
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
        }
        if (text && text.trim()) {
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
          texts = content.filter((c) => c.type === "text").map((c) => c.text);
        }
        const assistantText = texts.join("\n").trim();
        if (assistantText) {
          // 키워드 매칭: user 또는 assistant 텍스트에 키워드 포함 여부
          const combined = (pendingUser + " " + assistantText).toLowerCase();
          const matchCount = keywords.filter((kw) => combined.includes(kw)).length;

          if (matchCount > 0) {
            conversations.push({
              user: pendingUser,
              assistant: assistantText,
              relevance: matchCount / keywords.length,
            });
          }
          pendingUser = null;
        }
      }
    } catch (e) {
      // skip
    }
  }

  return { conversations, cwd: sessionCwd, date: sessionDate };
}

// --- 메인 ---

console.log(`🔍 검색어: "${QUERY}"`);
console.log(`   키워드: [${keywords.join(", ")}]`);
console.log("");

const sessionFiles = findAllSessionFiles();
console.log(`📋 전체 세션 ${sessionFiles.length}개 탐색 중...`);

const results = [];

for (const sf of sessionFiles) {
  const parsed = searchSession(sf.filePath, keywords);
  if (parsed.conversations.length === 0) continue;

  results.push({
    sessionId: sf.sessionId,
    cwd: parsed.cwd,
    date: parsed.date,
    conversations: parsed.conversations,
  });
}

// 날짜순 정렬
results.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

const totalConvs = results.reduce((sum, r) => sum + r.conversations.length, 0);
console.log(`\n✅ ${results.length}개 세션에서 ${totalConvs}개 관련 대화 발견`);

for (const r of results) {
  const projectName = r.cwd ? r.cwd.split("/").pop() : "unknown";
  console.log(`  📝 ${r.date} | ${projectName} — ${r.conversations.length}개 대화`);
}

// JSON 출력
const output = {
  query: QUERY,
  keywords,
  totalSessions: results.length,
  totalConversations: totalConvs,
  results: results.map((r) => ({
    sessionId: r.sessionId,
    cwd: r.cwd,
    date: r.date,
    conversations: r.conversations.map((c) => ({
      user: c.user,
      assistant: c.assistant,
      relevance: c.relevance,
    })),
  })),
};

const outputPath = `/tmp/notion-digest-search.json`;
writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`\n💾 검색 결과 저장: ${outputPath}`);
