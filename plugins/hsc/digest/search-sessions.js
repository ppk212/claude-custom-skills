// 모든 세션에서 검색어와 관련된 대화를 찾아 작업 파일로 저장한다.
//   node search-sessions.js --query "검색어" [--limit 60] [--max-chars 4000]
// 관련도(키워드 일치 비율) 높은 순으로 limit개만 남기고, 긴 답변은 잘라서 Claude가 읽을 분량을 제한한다.
import { writeFileSync } from "fs";
import { getArg, workPath } from "../lib/common.js";
import { mask } from "../lib/mask.js";
import { listSessionFiles, localDate, projectName, readConversations } from "../lib/sessions.js";

const query = getArg("--query");
const limit = Number(getArg("--limit", 60));
const maxChars = Number(getArg("--max-chars", 4000));
if (!query) {
  console.error('Usage: node search-sessions.js --query "검색어" [--limit 60] [--max-chars 4000]');
  process.exit(1);
}
const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
const clip = (t) => (t.length > maxChars ? t.slice(0, maxChars) + `\n…(${t.length - maxChars}자 생략)` : t);

const files = listSessionFiles();
console.log(`🔍 "${query}" — 세션 ${files.length}개 검색`);

const hits = [];
for (const f of files) {
  const { cwd, conversations } = readConversations(f.filePath);
  for (const c of conversations) {
    const text = `${c.user}\n${c.assistant}`.toLowerCase();
    const matched = keywords.filter((k) => text.includes(k)).length;
    if (matched) hits.push({ sessionId: f.sessionId, cwd, ...c, relevance: matched / keywords.length });
  }
}

const total = hits.length;
const kept = hits
  .sort((a, b) => b.relevance - a.relevance || (b.at || "").localeCompare(a.at || ""))
  .slice(0, limit)
  .sort((a, b) => (a.at || "").localeCompare(b.at || ""));

// 세션 단위로 묶어 시간순으로
const bySession = new Map();
for (const h of kept) {
  if (!bySession.has(h.sessionId)) {
    bySession.set(h.sessionId, { sessionId: h.sessionId, cwd: h.cwd, date: h.at ? localDate(h.at) : null, conversations: [] });
  }
  bySession.get(h.sessionId).conversations.push({
    at: h.at,
    relevance: Math.round(h.relevance * 100) / 100,
    user: clip(mask(h.user)),
    assistant: clip(mask(h.assistant)),
  });
}
const results = [...bySession.values()];

console.log(`✅ 관련 대화 ${total}개 중 ${kept.length}개 사용 (${results.length}개 세션)`);
for (const r of results) console.log(`  📝 ${r.date} | ${projectName(r.cwd)} — ${r.conversations.length}개`);
if (total > kept.length) console.log(`  (관련도 낮은 ${total - kept.length}개 제외. 더 보려면 --limit 를 늘리세요)`);

if (!kept.length) {
  console.log("관련 대화를 찾지 못했습니다.");
  process.exit(0);
}

const outPath = workPath("digest-search.json");
writeFileSync(outPath, JSON.stringify({ query, keywords, totalMatches: total, results }, null, 2), { mode: 0o600 });
console.log(`\nsearch: ${outPath}`);
console.log(`doc: ${workPath("digest-doc.json")}`);
