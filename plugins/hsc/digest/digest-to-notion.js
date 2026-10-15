// Claude가 쓴 종합 문서(digest-doc.json)를 Digest DB에 기록한다.
//   node digest-to-notion.js [--keep]
// 같은 이름의 문서가 있으면 날짜 구분과 함께 덧붙이고, 없으면 새로 만든다.
import { existsSync, readFileSync } from "fs";
import { requireConfig } from "../lib/config.js";
import { hasFlag, main, postSlack, removeQuietly, workPath } from "../lib/common.js";
import { block, markdownToBlocks, seg } from "../lib/markdown.js";
import { createNotion, title } from "../lib/notion.js";
import { localDate } from "../lib/sessions.js";

const cfg = requireConfig("digest");
const notion = createNotion(cfg.NOTION_API_KEY);
const docPath = workPath("digest-doc.json");
const searchPath = workPath("digest-search.json");

main(async () => {
  if (!existsSync(docPath)) throw new Error(`${docPath} 가 없습니다. 종합 문서를 먼저 작성하세요.`);
  const doc = JSON.parse(readFileSync(docPath, "utf-8"));
  if (!doc.name || !doc.details) throw new Error("digest-doc.json 에 name, details 가 필요합니다.");
  const date = localDate();
  const tags = (doc.tags || []).map((t) => ({ name: String(t).replace(/,/g, " ").slice(0, 100) }));
  const blocks = markdownToBlocks(doc.details);
  console.log(`📝 ${doc.name} [${(doc.tags || []).join(", ")}] — ${blocks.length}개 블록`);

  const [found] = await notion.queryDatabase(cfg.DIGEST_DB_ID, { property: "이름", title: { equals: doc.name } });
  let page;
  if (found) {
    await notion.updatePage(found.id, { "수정 날짜": { date: { start: date } }, 주제: { multi_select: tags } });
    await notion.appendBlocks(found.id, [
      block("divider", {}),
      block("heading_2", { rich_text: [seg(`📋 Digest — ${date}`)] }),
      ...blocks,
    ]);
    page = found;
    console.log(`✅ 기존 문서에 추가: ${doc.name}`);
  } else {
    page = await notion.createPage(
      { database_id: cfg.DIGEST_DB_ID },
      {
        이름: title(doc.name),
        주제: { multi_select: tags },
        "생성 날짜": { date: { start: date } },
        "수정 날짜": { date: { start: date } },
      },
      blocks,
    );
    console.log(`✅ 새 문서 생성: ${doc.name}`);
  }

  if (cfg.SLACK_WEBHOOK_URL) {
    const ok = await postSlack(cfg.SLACK_WEBHOOK_URL, {
      blocks: [
        { type: "header", text: { type: "plain_text", text: `📋 Digest — ${doc.name}`.slice(0, 150) } },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*태그:* ${(doc.tags || []).join(", ")}\n*상태:* ${found ? "기존 문서에 추가" : "새 문서 생성"}` },
        },
        ...(page.url
          ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "📖 Notion에서 보기" }, url: page.url }] }]
          : []),
      ],
    });
    if (ok) console.log("✅ Slack 알림 전송");
  }

  if (!hasFlag("--keep")) removeQuietly(docPath, searchPath);
  console.log(`\n🎉 완료${page.url ? `: ${page.url}` : ""}`);
});
