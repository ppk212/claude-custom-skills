// collect-sessions.js 결과와 Claude가 쓴 분석 JSON으로 Notion에 기록하고 Slack에 알린다.
//   node log-all-sessions.js --date YYYY-MM-DD [--keep]
// 같은 날짜를 다시 실행하면 일별 페이지를 새로 쓴다(덮어쓰기). 주제 페이지에는 날짜 구분으로 덧붙인다.
// 성공하면 대화 원문이 담긴 작업 파일을 지운다(--keep 이면 남김).
import { existsSync, readFileSync, writeFileSync } from "fs";
import { requireConfig, statePath } from "../lib/config.js";
import { getArg, hasFlag, main, postSlack, removeQuietly, workPath } from "../lib/common.js";
import { block, markdownToBlocks, richText, seg } from "../lib/markdown.js";
import { createNotion, title } from "../lib/notion.js";
import { localDate, projectName } from "../lib/sessions.js";

const cfg = requireConfig("notion-log");
const notion = createNotion(cfg.NOTION_API_KEY);

const date = getArg("--date", localDate());
const sessionsPath = workPath(`notion-sessions-${date}.json`);
const analysisPath = workPath(`notion-analysis-${date}.json`);

function loadAnalysis(data) {
  if (existsSync(analysisPath)) return JSON.parse(readFileSync(analysisPath, "utf-8"));
  // 분석 파일이 없으면 프로젝트 목록만으로 최소 기록을 만든다
  console.log("⚠️ 분석 파일이 없어 프로젝트 목록만 기록합니다.");
  const byProject = new Map();
  for (const s of data.sessions) {
    const name = projectName(s.cwd);
    byProject.set(name, (byProject.get(name) || 0) + s.conversationCount);
  }
  return {
    summary: `Claude Code 사용 기록 — ${data.sessions.length}개 세션`,
    details: `## ${date} 사용 기록\n` + [...byProject].map(([n, c]) => `- \`${n}\` — ${c}개 대화`).join("\n"),
    topics: [],
  };
}

function conversationBlocks(sessions) {
  const blocks = [];
  for (const s of sessions) {
    blocks.push(
      block("callout", {
        icon: { type: "emoji", emoji: "📂" },
        rich_text: [seg(s.cwd || "unknown", { code: true }), seg(` — ${s.conversationCount}개 대화`, { color: "gray" })],
      }),
    );
    for (const c of s.conversations) {
      blocks.push(block("heading_3", { rich_text: [seg("👤 사용자", { color: "blue" })] }));
      blocks.push(block("quote", { rich_text: richText(c.user, { plain: true }) }));
      blocks.push(block("heading_3", { rich_text: [seg("🤖 Claude", { color: "purple" })] }));
      blocks.push(...markdownToBlocks(c.assistant));
      blocks.push(block("divider", {}));
    }
  }
  return blocks;
}

const notice = block("quote", {
  rich_text: [
    seg("이 페이지는 "),
    seg("/hsc:notion-log", { code: true }),
    seg("가 Claude Code 세션 기록을 정리해 자동으로 만들었습니다. 같은 날짜를 다시 실행하면 새로 작성됩니다."),
  ],
});

main(async () => {
  if (!existsSync(sessionsPath)) throw new Error(`${sessionsPath} 가 없습니다. collect-sessions.js 를 먼저 실행하세요.`);
  const data = JSON.parse(readFileSync(sessionsPath, "utf-8"));
  const analysis = loadAnalysis(data);
  const totalConvs = data.sessions.reduce((n, s) => n + s.conversationCount, 0);
  console.log(`📋 ${date}: ${data.sessions.length}개 세션, ${totalConvs}개 대화`);

  // 1. 일별 페이지 (있으면 내용을 지우고 다시 씀. 예전 "대화 기록" 하위 페이지도 함께 정리됨)
  const summaryBlocks = [notice, ...markdownToBlocks(analysis.details)];
  const [existing] = await notion.queryDatabase(cfg.DAILY_DB_ID, { property: "생성 날짜", date: { equals: date } });
  let daily;
  if (existing) {
    await notion.clearChildren(existing.id);
    await notion.updatePage(existing.id, { 이름: title(analysis.summary) });
    await notion.appendBlocks(existing.id, summaryBlocks);
    daily = existing;
    console.log(`✅ 일별 기록 다시 작성: ${date}`);
  } else {
    daily = await notion.createPage(
      { database_id: cfg.DAILY_DB_ID },
      { 이름: title(analysis.summary), "생성 날짜": { date: { start: date } }, 선택: { select: { name: "Claude Code" } } },
      summaryBlocks,
    );
    console.log(`✅ 일별 기록 생성: ${date}`);
  }

  // 2. 대화 기록 하위 페이지
  const convBlocks = conversationBlocks(data.sessions);
  await notion.createPage({ page_id: daily.id }, { title: title("대화 기록") }, convBlocks);
  console.log(`✅ 대화 기록 작성 (${convBlocks.length}개 블록)`);

  // 3. 주제별 페이지 — 같은 이름이 있으면 날짜 구분선과 함께 덧붙임
  for (const topic of analysis.topics || []) {
    const tags = (topic.tags || []).map((t) => ({ name: String(t).replace(/,/g, " ").slice(0, 100) }));
    const blocks = markdownToBlocks(topic.details || "");
    const [found] = await notion.queryDatabase(cfg.TOPIC_DB_ID, { property: "이름", title: { equals: topic.name } });
    if (found) {
      await notion.updatePage(found.id, { "수정 날짜": { date: { start: date } }, 주제: { multi_select: tags } });
      await notion.appendBlocks(found.id, [
        block("divider", {}),
        block("heading_3", { rich_text: [seg(`📅 ${date}`)] }),
        ...blocks,
      ]);
      console.log(`✅ 주제 추가: ${topic.name}`);
    } else {
      await notion.createPage(
        { database_id: cfg.TOPIC_DB_ID },
        {
          이름: title(topic.name),
          주제: { multi_select: tags },
          "생성 날짜": { date: { start: date } },
          "수정 날짜": { date: { start: date } },
        },
        blocks,
      );
      console.log(`✅ 주제 생성: ${topic.name}`);
    }
  }

  // 4. 완료 표시 (어제 기록 알림이 이걸 보고 조용해진다)
  writeFileSync(statePath(`notion-log-done-${date}`), new Date().toISOString());

  // 5. Slack
  if (cfg.SLACK_WEBHOOK_URL) {
    const projects = data.sessions.map((s) => `• \`${projectName(s.cwd)}\` — ${s.conversationCount}개 대화`).join("\n");
    const topics = (analysis.topics || []).map((t) => `• ${t.name} [${(t.tags || []).join(", ")}]`).join("\n");
    const ok = await postSlack(cfg.SLACK_WEBHOOK_URL, {
      blocks: [
        { type: "header", text: { type: "plain_text", text: `📝 Claude Code 기록 — ${date}` } },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*${analysis.summary}*\n\n📊 *${data.sessions.length}개 세션* | *${totalConvs}개 대화*` },
        },
        { type: "section", text: { type: "mrkdwn", text: `*프로젝트별:*\n${projects}`.slice(0, 2900) } },
        ...(topics ? [{ type: "section", text: { type: "mrkdwn", text: `*주제:*\n${topics}`.slice(0, 2900) } }] : []),
        ...(daily.url
          ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "📖 Notion에서 보기" }, url: daily.url }] }]
          : []),
      ],
    });
    if (ok) console.log("✅ Slack 알림 전송");
  }

  if (!hasFlag("--keep")) removeQuietly(sessionsPath, analysisPath);
  console.log(`\n🎉 완료${daily.url ? `: ${daily.url}` : ""}`);
});
