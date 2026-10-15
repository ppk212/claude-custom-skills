// 지정한 날짜(로컬 기준)에 나눈 대화를 모든 프로젝트에서 모아 작업 파일로 저장한다.
//   node collect-sessions.js [--date YYYY-MM-DD]
// 출력 마지막 줄들에 sessions 파일과, Claude가 써야 할 analysis 파일 경로를 알려준다.
import { writeFileSync } from "fs";
import { getArg, workPath } from "../lib/common.js";
import { mask } from "../lib/mask.js";
import { listSessionFiles, localDate, projectName, readConversations, startOfLocalDay } from "../lib/sessions.js";

const date = getArg("--date", localDate());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Usage: node collect-sessions.js [--date YYYY-MM-DD]");
  process.exit(1);
}

// 그날 이후에 수정된 파일만 열어 본다. 날짜를 넘겨 이어진 세션도 그날 대화만 골라낸다.
const files = listSessionFiles({ modifiedSince: startOfLocalDay(date) });
const sessions = [];
for (const f of files) {
  const { cwd, conversations } = readConversations(f.filePath, { date });
  if (!conversations.length) continue;
  sessions.push({
    sessionId: f.sessionId,
    cwd,
    startedAt: conversations[0].at,
    conversationCount: conversations.length,
    conversations: conversations.map((c) => ({ user: mask(c.user), assistant: mask(c.assistant), at: c.at })),
  });
}
sessions.sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));

const total = sessions.reduce((n, s) => n + s.conversationCount, 0);
console.log(`📋 ${date}: 세션 ${sessions.length}개, 대화 ${total}개`);
for (const s of sessions) console.log(`  📝 ${s.sessionId.slice(0, 8)} ${projectName(s.cwd)} — ${s.conversationCount}개`);

if (!sessions.length) {
  console.log("기록할 대화가 없습니다.");
  process.exit(0);
}

const sessionsPath = workPath(`notion-sessions-${date}.json`);
writeFileSync(sessionsPath, JSON.stringify({ date, sessions }, null, 2), { mode: 0o600 });
console.log(`\nsessions: ${sessionsPath}`);
console.log(`analysis: ${workPath(`notion-analysis-${date}.json`)}`);
