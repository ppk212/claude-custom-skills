import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const TOPIC_DB_ID = process.env.TOPIC_DB_ID;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const NOTION_VERSION = "2022-06-28";

const headers = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  "Content-Type": "application/json",
  "Notion-Version": NOTION_VERSION,
};

// --- Notion helpers ---

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      if (i === retries - 1) throw e;
      console.log(`  ⏳ 네트워크 오류, ${i + 2}번째 시도...`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function notionPost(endpoint, body) {
  const resp = await fetchWithRetry(`https://api.notion.com/v1${endpoint}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Notion API: ${resp.status} - ${await resp.text()}`);
  return resp.json();
}

async function notionPatch(endpoint, body) {
  const resp = await fetchWithRetry(`https://api.notion.com/v1${endpoint}`, {
    method: "PATCH", headers, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Notion API: ${resp.status} - ${await resp.text()}`);
  return resp.json();
}

// --- 마크다운 → Notion 블록 ---

function buildDetailBlocks(md) {
  const blocks = [];
  const lines = md.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: line.replace("## ", "") } }] } });
    } else if (line.startsWith("### ")) {
      blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: line.replace("### ", "") } }] } });
    } else if (line.startsWith("- ")) {
      const children = [];
      while (i + 1 < lines.length && lines[i + 1].startsWith("  - ")) {
        i++;
        children.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: { rich_text: [{ text: { content: lines[i].replace("  - ", "") } }] },
        });
      }
      const block = {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: line.replace("- ", "") } }] },
      };
      if (children.length > 0) block.bulleted_list_item.children = children;
      blocks.push(block);
    } else if (line.startsWith("```")) {
      // 코드 블록 수집
      const lang = line.replace("```", "").trim() || "plain text";
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      const codeContent = codeLines.join("\n");
      if (codeContent.trim()) {
        // Notion 코드 블록 2000자 제한
        const chunks = [];
        let remaining = codeContent;
        while (remaining.length > 0) {
          chunks.push(remaining.slice(0, 1900));
          remaining = remaining.slice(1900);
        }
        for (const chunk of chunks) {
          blocks.push({
            object: "block",
            type: "code",
            code: {
              rich_text: [{ text: { content: chunk } }],
              language: lang === "sql" ? "sql" : lang === "ts" || lang === "typescript" ? "typescript" : lang === "js" || lang === "javascript" ? "javascript" : "plain text",
            },
          });
        }
      }
    } else if (line.trim()) {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: line } }] } });
    }
  }
  return blocks;
}

// --- 메인 ---

const docPath = "/tmp/notion-digest-doc.json";
const doc = JSON.parse(readFileSync(docPath, "utf-8"));
const date = new Date().toISOString().split("T")[0];

console.log(`📝 주제: ${doc.name}`);
console.log(`   태그: [${doc.tags.join(", ")}]`);

// 기존 주제 검색
const topicQuery = await notionPost(`/databases/${TOPIC_DB_ID}/query`, {
  filter: { property: "이름", title: { equals: doc.name } },
});
const existingTopic = topicQuery.results[0];

const tags = doc.tags.map((t) => ({ name: t }));
const blocks = buildDetailBlocks(doc.details);

if (existingTopic) {
  // 기존 주제에 append
  await notionPatch(`/pages/${existingTopic.id}`, {
    properties: {
      "수정 날짜": { date: { start: date } },
      주제: { multi_select: tags },
    },
  });
  const appendBlocks = [
    { object: "block", type: "divider", divider: {} },
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ text: { content: `📋 Digest — ${date}` } }] },
    },
    ...blocks,
  ];
  for (let i = 0; i < appendBlocks.length; i += 100) {
    const batch = appendBlocks.slice(i, i + 100);
    await notionPatch(`/blocks/${existingTopic.id}/children`, { children: batch });
  }
  console.log(`✅ 기존 주제에 추가: ${doc.name}`);
} else {
  // 새 페이지 생성
  const pageBlocks = blocks.slice(0, 100); // 첫 100블록은 생성 시 포함
  const newPage = await notionPost("/pages", {
    parent: { database_id: TOPIC_DB_ID },
    properties: {
      이름: { title: [{ text: { content: doc.name } }] },
      주제: { multi_select: tags },
      "생성 날짜": { date: { start: date } },
      "수정 날짜": { date: { start: date } },
    },
    children: pageBlocks,
  });
  // 나머지 블록 append
  for (let i = 100; i < blocks.length; i += 100) {
    const batch = blocks.slice(i, i + 100);
    await notionPatch(`/blocks/${newPage.id}/children`, { children: batch });
  }
  console.log(`✅ 주제 생성: ${doc.name}`);
}

// Slack 알림
if (SLACK_WEBHOOK_URL) {
  const slackPayload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `📋 Digest 생성 — ${doc.name}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*태그:* ${doc.tags.join(", ")}\n*상태:* ${existingTopic ? "기존 주제에 추가" : "새 문서 생성"}`,
        },
      },
    ],
  };

  try {
    const resp = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });
    if (resp.ok) console.log(`✅ Slack 알림 전송`);
  } catch (e) {
    console.log(`⚠️ Slack 알림 실패: ${e.message}`);
  }
}

console.log(`\n🎉 완료!`);
