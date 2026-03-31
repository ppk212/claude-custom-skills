import "dotenv/config";

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const DAILY_DB_ID = process.env.DAILY_DB_ID;
const TOPIC_DB_ID = process.env.TOPIC_DB_ID;
const NOTION_VERSION = "2022-06-28";

const headers = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  "Content-Type": "application/json",
  "Notion-Version": NOTION_VERSION,
};

// --- Notion API helpers ---

async function notionPost(endpoint, body) {
  const resp = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`Notion API error: ${resp.status} - ${JSON.stringify(err)}`);
  }
  return resp.json();
}

async function notionPatch(endpoint, body) {
  const resp = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`Notion API error: ${resp.status} - ${JSON.stringify(err)}`);
  }
  return resp.json();
}

// --- Daily Log ---

async function findTodayPage(date) {
  const result = await notionPost(`/databases/${DAILY_DB_ID}/query`, {
    filter: {
      property: "생성 날짜",
      date: { equals: date },
    },
  });
  return result.results[0] || null;
}

async function createDailyPage(date, summary, details) {
  return notionPost("/pages", {
    parent: { database_id: DAILY_DB_ID },
    properties: {
      이름: { title: [{ text: { content: summary } }] },
      "생성 날짜": { date: { start: date } },
      선택: { select: { name: "Claude Code" } },
    },
    children: buildContentBlocks(details),
  });
}

async function clearPageContent(pageId) {
  const resp = await fetch(
    `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
    { headers }
  );
  const data = await resp.json();
  for (const block of data.results || []) {
    await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
      method: "DELETE",
      headers,
    });
  }
}

async function rewriteDailyPage(pageId, summary, details) {
  await clearPageContent(pageId);
  // Update title too
  await notionPatch(`/pages/${pageId}`, {
    properties: {
      이름: { title: [{ text: { content: summary } }] },
    },
  });
  return notionPatch(`/blocks/${pageId}/children`, {
    children: buildContentBlocks(details),
  });
}

// --- Topic Log ---

async function findTopicPage(topicName) {
  const result = await notionPost(`/databases/${TOPIC_DB_ID}/query`, {
    filter: {
      property: "이름",
      title: { equals: topicName },
    },
  });
  return result.results[0] || null;
}

async function createTopicPage(topicName, tags, date, details) {
  return notionPost("/pages", {
    parent: { database_id: TOPIC_DB_ID },
    properties: {
      이름: { title: [{ text: { content: topicName } }] },
      주제: { multi_select: tags.map((t) => ({ name: t })) },
      "생성 날짜": { date: { start: date } },
      "수정 날짜": { date: { start: date } },
    },
    children: buildContentBlocks(details),
  });
}

async function rewriteTopicPage(pageId, date, details) {
  await clearPageContent(pageId);
  await notionPatch(`/pages/${pageId}`, {
    properties: {
      "수정 날짜": { date: { start: date } },
    },
  });
  return notionPatch(`/blocks/${pageId}/children`, {
    children: buildContentBlocks(details),
  });
}

// --- Content helpers ---

function buildContentBlocks(details) {
  if (!details) return [];

  const blocks = [];
  const lines = details.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ text: { content: line.replace("## ", "") } }],
        },
      });
    } else if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: line.replace("### ", "") } }],
        },
      });
    } else if (line.startsWith("- ")) {
      // Collect sub-items (lines starting with "  - ")
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
        bulleted_list_item: {
          rich_text: [{ text: { content: line.replace("- ", "") } }],
        },
      };
      if (children.length > 0) {
        block.bulleted_list_item.children = children;
      }
      blocks.push(block);
    } else if (line.trim()) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: line } }],
        },
      });
    }
  }

  return blocks;
}

// --- Conversation Log (하위 페이지) ---

function buildConversationBlocks(conversations, cwd) {
  const blocks = [];

  // 실행 경로 표시
  if (cwd) {
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "📂" },
        rich_text: [
          { text: { content: "실행 경로: " }, annotations: { bold: true } },
          { text: { content: cwd }, annotations: { code: true } },
        ],
      },
    });
    blocks.push({ object: "block", type: "divider", divider: {} });
  }

  for (const conv of conversations) {
    // 사용자 질문
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ text: { content: "👤 사용자" }, annotations: { color: "blue" } }],
      },
    });
    blocks.push({
      object: "block",
      type: "quote",
      quote: {
        rich_text: [{ text: { content: conv.user } }],
      },
    });

    // Claude 응답
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ text: { content: "🤖 Claude" }, annotations: { color: "purple" } }],
      },
    });
    // 응답이 길면 여러 paragraph로 분할 (Notion 2000자 제한)
    const chunks = splitText(conv.assistant, 1900);
    for (const chunk of chunks) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: chunk } }],
        },
      });
    }

    blocks.push({ object: "block", type: "divider", divider: {} });
  }

  return blocks;
}

function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    // 줄바꿈 기준으로 자르기
    let cutAt = remaining.lastIndexOf("\n", maxLen);
    if (cutAt <= 0) cutAt = maxLen;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).replace(/^\n/, "");
  }
  return chunks;
}

async function findConversationPage(parentPageId) {
  // 하위 블록 중 "대화 기록" child_page 찾기
  const resp = await fetch(
    `https://api.notion.com/v1/blocks/${parentPageId}/children?page_size=100`,
    { headers }
  );
  const data = await resp.json();
  for (const block of data.results || []) {
    if (block.type === "child_page" && block.child_page?.title === "대화 기록") {
      return block.id;
    }
  }
  return null;
}

async function createConversationPage(parentPageId, conversations, cwd) {
  return notionPost("/pages", {
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ text: { content: "대화 기록" } }] },
    },
    children: buildConversationBlocks(conversations, cwd),
  });
}

async function rewriteConversationPage(pageId, conversations, cwd) {
  await clearPageContent(pageId);
  return notionPatch(`/blocks/${pageId}/children`, {
    children: buildConversationBlocks(conversations, cwd),
  });
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

// --- Main ---

async function log({ summary, details, topics, conversations, cwd }) {
  const date = getToday();

  // 1. Daily log — 기존 페이지 있으면 전체 다시 작성
  let dailyPageId;
  const existingDaily = await findTodayPage(date);
  if (existingDaily) {
    await rewriteDailyPage(existingDaily.id, summary, details);
    dailyPageId = existingDaily.id;
    console.log(`✅ 일별 기록 다시 작성: ${date}`);
  } else {
    const newPage = await createDailyPage(date, summary, details);
    dailyPageId = newPage.id;
    console.log(`✅ 일별 기록 생성: ${date} - ${summary}`);
  }

  // 2. Conversation log — 대화 기록 하위 페이지
  if (conversations && conversations.length > 0) {
    const existingConv = await findConversationPage(dailyPageId);
    if (existingConv) {
      await rewriteConversationPage(existingConv, conversations, cwd);
      console.log(`✅ 대화 기록 다시 작성`);
    } else {
      await createConversationPage(dailyPageId, conversations, cwd);
      console.log(`✅ 대화 기록 생성`);
    }
  }

  // 3. Topic log — 기존 주제 있으면 전체 다시 작성
  if (topics && topics.length > 0) {
    for (const topic of topics) {
      // 주제 details에 경로 정보 추가
      const topicDetails = cwd
        ? `📂 경로: \`${cwd}\`\n${topic.details || details}`
        : topic.details || details;

      const existingTopic = await findTopicPage(topic.name);
      if (existingTopic) {
        await rewriteTopicPage(existingTopic.id, date, topicDetails);
        console.log(`✅ 주제 다시 작성: ${topic.name}`);
      } else {
        await createTopicPage(topic.name, topic.tags || [], date, topicDetails);
        console.log(`✅ 주제 생성: ${topic.name}`);
      }
    }
  }
}

// --- CLI ---

const args = process.argv.slice(2);
const command = args[0];

if (command === "log") {
  const summary = getArg(args, "--summary") || `Claude Code 세션 - ${getToday()}`;
  const details = getArg(args, "--details") || "";
  const topicsJson = getArg(args, "--topics");
  const topics = topicsJson ? JSON.parse(topicsJson) : [];
  const convsJson = getArg(args, "--conversations");
  const conversations = convsJson ? JSON.parse(convsJson) : [];
  const cwd = getArg(args, "--cwd") || null;

  await log({ summary, details, topics, conversations, cwd });

  // Stop hook용 마커 파일 생성 (오늘 로깅 완료 표시)
  import("fs").then(fs => {
    const marker = `/tmp/notion-log-done-${getToday()}`;
    fs.writeFileSync(marker, new Date().toISOString());
    console.log(`📌 로깅 마커 생성: ${marker}`);
  });
} else {
  console.log(`Usage:
  node index.js log
    --summary "세션 제목"
    --details "마크다운 내용"
    --topics '[{"name":"...", "tags":["..."], "details":"..."}]'
    --conversations '[{"user":"질문", "assistant":"답변"}, ...]'
    --cwd "/path/to/project"
  `);
}

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}
