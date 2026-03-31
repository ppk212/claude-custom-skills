import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const DAILY_DB_ID = process.env.DAILY_DB_ID;
const TOPIC_DB_ID = process.env.TOPIC_DB_ID;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const NOTION_VERSION = "2022-06-28";

const headers = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  "Content-Type": "application/json",
  "Notion-Version": NOTION_VERSION,
};

// --- Notion helpers (index.js에서 복사) ---

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, options);
      return resp;
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

async function clearPageContent(pageId) {
  const resp = await fetchWithRetry(
    `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
    { headers }
  );
  const data = await resp.json();
  for (const block of data.results || []) {
    try {
      await fetchWithRetry(`https://api.notion.com/v1/blocks/${block.id}`, {
        method: "DELETE", headers,
      });
    } catch (e) {
      console.log(`  ⚠️ 블록 삭제 실패 (무시): ${e.message}`);
    }
  }
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

// --- 대화 블록 빌더 (세션별 구분) ---

function buildMultiSessionConvBlocks(sessions) {
  const blocks = [];

  for (const session of sessions) {
    // 세션 헤더: 경로 callout
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "📂" },
        rich_text: [
          { text: { content: session.cwd }, annotations: { code: true } },
          { text: { content: ` — ${session.conversationCount}개 대화` }, annotations: { color: "gray" } },
        ],
      },
    });

    // 각 대화
    for (const conv of session.conversations) {
      // 사용자 (원문)
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "👤 사용자" }, annotations: { color: "blue" } }],
        },
      });

      // Notion rich_text 2000자 제한 처리
      const userChunks = splitText(conv.user, 1900);
      for (const chunk of userChunks) {
        blocks.push({
          object: "block",
          type: "quote",
          quote: { rich_text: [{ text: { content: chunk } }] },
        });
      }

      // Claude 응답 (원문 — 요약은 summary에서 함)
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "🤖 Claude" }, annotations: { color: "purple" } }],
        },
      });

      const assistantChunks = splitText(conv.assistant, 1900);
      for (const chunk of assistantChunks) {
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: chunk } }] },
        });
      }

      blocks.push({ object: "block", type: "divider", divider: {} });
    }

    // 세션 구분선
    blocks.push({ object: "block", type: "divider", divider: {} });
  }

  return blocks;
}

function splitText(text, maxLen) {
  if (!text) return [""];
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    let cutAt = remaining.lastIndexOf("\n", maxLen);
    if (cutAt <= 0) cutAt = maxLen;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).replace(/^\n/, "");
  }
  return chunks;
}

// --- 요약 블록 빌더 (중첩 bullet + (자동) 지원) ---

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
        const subText = lines[i].replace("  - ", "");
        const isAuto = subText.startsWith("(자동)");
        children.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: isAuto
              ? [
                  { text: { content: "(자동) " }, annotations: { color: "gray" } },
                  { text: { content: subText.replace("(자동) ", "").replace("(자동)", "") } },
                ]
              : [{ text: { content: subText } }],
          },
        });
      }
      const block = {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ text: { content: line.replace("- ", "") } }] },
      };
      if (children.length > 0) block.bulleted_list_item.children = children;
      blocks.push(block);
    } else if (line.trim()) {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: line } }] } });
    }
  }
  return blocks;
}

// --- 메인 ---

const sessionsPath = process.argv[2] || `/tmp/notion-sessions-${getToday()}.json`;
const analysisPath = process.argv[3] || null;

const data = JSON.parse(readFileSync(sessionsPath, "utf-8"));

// 세션 데이터에 date가 있으면 그걸 사용, 없으면 오늘
const date = data.date || getToday();

// analysis 경로: 명시적 지정 or 날짜 기반 자동 탐색
const resolvedAnalysisPath = analysisPath || `/tmp/notion-analysis-${date}.json`;

let analysis;
try {
  analysis = JSON.parse(readFileSync(resolvedAnalysisPath, "utf-8"));
} catch {
  // analysis 파일이 없으면 프로젝트 경로 기반 자동 생성
  const sessionSummaries = data.sessions
    .map((s) => `- 📂 \`${s.cwd}\` — ${s.conversationCount}개 대화`)
    .join("\n");

  // 프로젝트별 자동 주제 생성
  const autoTopics = data.sessions.map((s) => {
    const projectName = s.cwd.split("/").pop() || s.cwd;
    return {
      name: `${projectName} 작업 기록`,
      tags: [projectName, "Claude Code"],
      details: `## ${date} 세션\n- ${s.conversationCount}개 대화\n- 경로: \`${s.cwd}\``,
    };
  });

  // 같은 이름의 주제는 합치기
  const mergedTopics = [];
  for (const t of autoTopics) {
    const existing = mergedTopics.find((m) => m.name === t.name);
    if (existing) {
      existing.details += `\n${t.details}`;
    } else {
      mergedTopics.push(t);
    }
  }

  analysis = {
    summary: `Claude Code 사용 기록 — ${data.sessions.length}개 세션`,
    details: `## 오늘의 Claude Code 사용 기록\n${sessionSummaries}`,
    topics: mergedTopics,
  };
}

console.log(`📋 ${data.sessions.length}개 세션, 총 ${data.sessions.reduce((s, x) => s + x.conversationCount, 0)}개 대화`);

// 시스템 설명 인용 블록 (페이지 상단)
const systemQuoteBlock = {
  object: "block",
  type: "quote",
  quote: {
    rich_text: [
      { text: { content: "이 페이지는 " }, annotations: {} },
      { text: { content: "Claude Code Custom Skill + Hook + Node.js 스크립트 + launchd" }, annotations: { bold: true } },
      { text: { content: "로 구성된 자동 업무 기록 파이프라인에 의해 자동 생성되었습니다.\n" }, annotations: {} },
      { text: { content: "/notion-log" }, annotations: { code: true } },
      { text: { content: " 커맨드 실행 또는 매일 자정 자동 수집 → Notion API로 기록 → Slack 알림 전송" }, annotations: {} },
    ],
    color: "default",
  },
};

// 1. 일별 페이지 — 요약 details 포함
const dailyQuery = await notionPost(`/databases/${DAILY_DB_ID}/query`, {
  filter: { property: "생성 날짜", date: { equals: date } },
});
let dailyPageId;
const existingDaily = dailyQuery.results[0];

if (existingDaily) {
  await clearPageContent(existingDaily.id);
  await notionPatch(`/pages/${existingDaily.id}`, {
    properties: { 이름: { title: [{ text: { content: analysis.summary } }] } },
  });
  await notionPatch(`/blocks/${existingDaily.id}/children`, {
    children: [systemQuoteBlock, ...buildDetailBlocks(analysis.details)],
  });
  dailyPageId = existingDaily.id;
  console.log(`✅ 일별 기록 다시 작성: ${date}`);
} else {
  const newPage = await notionPost("/pages", {
    parent: { database_id: DAILY_DB_ID },
    properties: {
      이름: { title: [{ text: { content: analysis.summary } }] },
      "생성 날짜": { date: { start: date } },
      선택: { select: { name: "Claude Code" } },
    },
    children: [systemQuoteBlock, ...buildDetailBlocks(analysis.details)],
  });
  dailyPageId = newPage.id;
  console.log(`✅ 일별 기록 생성: ${date}`);
}

// 2. 대화 기록 하위 페이지
const childrenResp = await fetch(
  `https://api.notion.com/v1/blocks/${dailyPageId}/children?page_size=100`,
  { headers }
);
const childrenData = await childrenResp.json();
let convPageId = null;
for (const block of childrenData.results || []) {
  if (block.type === "child_page" && block.child_page?.title === "대화 기록") {
    convPageId = block.id;
    break;
  }
}

const allConvBlocks = buildMultiSessionConvBlocks(data.sessions);

if (convPageId) {
  await clearPageContent(convPageId);
} else {
  const convPage = await notionPost("/pages", {
    parent: { page_id: dailyPageId },
    properties: { title: { title: [{ text: { content: "대화 기록" } }] } },
    children: [],
  });
  convPageId = convPage.id;
}

for (let i = 0; i < allConvBlocks.length; i += 100) {
  const batch = allConvBlocks.slice(i, i + 100);
  await notionPatch(`/blocks/${convPageId}/children`, { children: batch });
}
console.log(`✅ 대화 기록 작성 (${allConvBlocks.length}개 블록)`);

// 3. 주제별 기록
if (analysis.topics && analysis.topics.length > 0) {
  for (const topic of analysis.topics) {
    const topicQuery = await notionPost(`/databases/${TOPIC_DB_ID}/query`, {
      filter: { property: "이름", title: { equals: topic.name } },
    });
    const existingTopic = topicQuery.results[0];

    const tags = (topic.tags || []).map(t => ({ name: t }));
    const topicBlocks = buildDetailBlocks(topic.details || "");

    if (existingTopic) {
      // 기존 주제에 날짜 구분하여 append
      await notionPatch(`/pages/${existingTopic.id}`, {
        properties: {
          "수정 날짜": { date: { start: date } },
          주제: { multi_select: tags },
        },
      });
      if (topicBlocks.length > 0) {
        const appendBlocks = [
          { object: "block", type: "divider", divider: {} },
          {
            object: "block",
            type: "heading_3",
            heading_3: {
              rich_text: [{ text: { content: `📅 ${date}` } }],
            },
          },
          ...topicBlocks,
        ];
        await notionPatch(`/blocks/${existingTopic.id}/children`, { children: appendBlocks });
      }
      console.log(`✅ 주제 추가: ${topic.name} (${date})`);
    } else {
      await notionPost("/pages", {
        parent: { database_id: TOPIC_DB_ID },
        properties: {
          이름: { title: [{ text: { content: topic.name } }] },
          주제: { multi_select: tags },
          "생성 날짜": { date: { start: date } },
          "수정 날짜": { date: { start: date } },
        },
        children: topicBlocks,
      });
      console.log(`✅ 주제 생성: ${topic.name}`);
    }
  }
}

// 4. 마커 파일
writeFileSync(`/tmp/notion-log-done-${date}`, new Date().toISOString());
console.log(`📌 로깅 마커 생성`);

// 5. Slack 알림
if (SLACK_WEBHOOK_URL) {
  const totalConvs = data.sessions.reduce((s, x) => s + x.conversationCount, 0);
  const projectList = data.sessions
    .map((s) => {
      const name = s.cwd.split("/").pop() || s.cwd;
      return `• \`${name}\` — ${s.conversationCount}개 대화`;
    })
    .join("\n");

  const topicList = (analysis.topics || [])
    .map((t) => `• ${t.name} [${(t.tags || []).join(", ")}]`)
    .join("\n");

  const notionUrl = `https://www.notion.so/${DAILY_DB_ID.replace(/-/g, "")}`;

  const slackPayload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `📝 Claude Code 기록 완료 — ${date}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${analysis.summary}*\n\n📊 *${data.sessions.length}개 세션* | *${totalConvs}개 대화*`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*프로젝트별:*\n${projectList}`,
        },
      },
      ...(topicList
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*주제:*\n${topicList}`,
              },
            },
          ]
        : []),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "📖 Notion에서 보기" },
            url: notionUrl,
          },
        ],
      },
    ],
  };

  try {
    const slackResp = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });
    if (slackResp.ok) {
      console.log(`✅ Slack 알림 전송 (#claude-alert)`);
    } else {
      console.error(`⚠️ Slack 알림 실패: ${slackResp.status}`);
    }
  } catch (e) {
    console.error(`⚠️ Slack 알림 오류: ${e.message}`);
  }
}

console.log(`\n🎉 완료!`);
