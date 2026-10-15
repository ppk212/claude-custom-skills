// node --test plugins/hsc/test   (외부 의존성 없음. Notion은 로컬 가짜 서버로 대신한다)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { markdownToBlocks, richText } = await import(`${ROOT}/lib/markdown.js`);
const { mask } = await import(`${ROOT}/lib/mask.js`);

test("markdown: 제목·중첩 목록·(자동)·코드·인라인 서식", () => {
  const blocks = markdownToBlocks(
    ["## 결과", "- 배포 완료 `v1.2`", "  - (자동) **CI** 확인", "1. 첫째", "```sql", "SELECT 1;", "```", "---", "> 인용"].join("\n"),
  );
  assert.deepEqual(blocks.map((b) => b.type), ["heading_2", "bulleted_list_item", "numbered_list_item", "code", "divider", "quote"]);
  const item = blocks[1].bulleted_list_item;
  assert.equal(item.rich_text[1].annotations.code, true);
  const child = item.children[0].bulleted_list_item.rich_text;
  assert.equal(child[0].annotations.color, "gray");
  assert.equal(child[1].annotations.bold, true);
  assert.equal(blocks[3].code.language, "sql");
});

test("markdown: 2000자 넘는 문단은 여러 조각으로 나뉜다", () => {
  const rt = richText("가".repeat(5000));
  assert.ok(rt.length >= 3);
  assert.ok(rt.every((r) => r.text.content.length <= 2000));
});

test("mask: 토큰·키=값·비밀번호는 가리고 일반 문장은 둔다", () => {
  const out = mask("ghp_abcdefghijklmnop1234 API_KEY=supersecret 비밀번호는 hunter2 그리고 커밋 3f2a9c1e");
  assert.ok(!out.includes("ghp_abcdefghijklmnop1234"));
  assert.ok(!out.includes("supersecret"));
  assert.ok(!out.includes("hunter2"));
  assert.ok(out.includes("3f2a9c1e"));
});

// --- 세션 fixture ---
function makeClaudeDir() {
  const dir = mkdtempSync(join(tmpdir(), "hsc-test-"));
  const proj = join(dir, ".claude", "projects", "-Users-me-app");
  mkdirSync(proj, { recursive: true });
  const at = (h) => new Date(2026, 9, 14, h, 0, 0).toISOString(); // 로컬 10/14
  const prev = new Date(2026, 9, 13, 23, 0, 0).toISOString(); // 로컬 10/13
  const lines = [
    { type: "user", cwd: "/Users/me/app", timestamp: prev, message: { content: "어제 질문" } },
    { type: "assistant", timestamp: prev, message: { content: [{ type: "text", text: "어제 답" }] } },
    { type: "user", cwd: "/Users/me/app", timestamp: at(1), message: { content: "배포해줘 token=abc123secret" } },
    { type: "assistant", timestamp: at(1), message: { content: [{ type: "text", text: "확인해 볼게요" }, { type: "tool_use", name: "Bash" }] } },
    { type: "user", timestamp: at(1), message: { content: [{ type: "tool_result", content: "ok" }] } },
    { type: "user", isMeta: true, timestamp: at(1), message: { content: "자동 주입" } },
    { type: "assistant", timestamp: at(1), message: { content: [{ type: "text", text: "## 배포 완료\n- v2 반영" }] } },
  ];
  writeFileSync(join(proj, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
  return dir;
}

test("sessions: 답변 조각을 이어 붙이고, tool_result·isMeta는 빼고, 로컬 날짜로 거른다", async () => {
  const dir = makeClaudeDir();
  const out = execFileSync("node", ["-e", `
    const s = await import(${JSON.stringify(`${ROOT}/lib/sessions.js`)});
    const [f] = s.listSessionFiles();
    console.log(JSON.stringify(s.readConversations(f.filePath, { date: "2026-10-14" })));
  `, "--input-type=module"], { env: { ...process.env, CLAUDE_CONFIG_DIR: join(dir, ".claude") } });
  const r = JSON.parse(out);
  assert.equal(r.conversations.length, 1);
  assert.match(r.conversations[0].assistant, /확인해 볼게요[\s\S]*배포 완료/);
});

// --- 가짜 Notion 서버로 전체 흐름 ---
function fakeNotion() {
  const calls = [];
  const children = new Map(); // id -> blocks
  let n = 0;
  let throttled = false;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = body ? JSON.parse(body) : null;
      calls.push({ method: req.method, url: req.url, body: json });
      const send = (code, obj, headers = {}) => {
        res.writeHead(code, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(obj));
      };
      if (!throttled && req.url === "/pages") {
        throttled = true;
        return send(429, { message: "slow down" }, { "retry-after": "0" });
      }
      if (req.url.includes("/query")) return send(200, { results: [] });
      if (req.method === "POST" && req.url === "/pages") {
        const id = `p${++n}`;
        children.set(id, json.children || []);
        return send(200, { id, url: `notion.example/${id}` });
      }
      const m = req.url.match(/^\/blocks\/([^/]+)\/children/);
      if (m && req.method === "PATCH") {
        assert.ok(json.children.length <= 100, "한 번에 100블록 이하");
        children.get(m[1]).push(...json.children);
        return send(200, {});
      }
      send(404, { message: "unknown" });
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, calls, children, port: server.address().port })));
}

function run(script, args, env) {
  return new Promise((resolve) => {
    const p = spawn("node", [join(ROOT, script), ...args], { env: { ...process.env, ...env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
}

test("notion-log: 수집 → 기록, 429 재시도, 100블록 분할, 비밀값 가림, 작업 파일 정리", async () => {
  const dir = makeClaudeDir();
  const { server, calls, children, port } = await fakeNotion();
  const env = {
    CLAUDE_CONFIG_DIR: join(dir, ".claude"),
    HSC_CONFIG_DIR: join(dir, "cfg"),
    HSC_WORK_DIR: join(dir, "work"),
    HSC_NOTION_API: `http://127.0.0.1:${port}`,
    NOTION_API_KEY: "k", DAILY_DB_ID: "d", TOPIC_DB_ID: "t", SLACK_WEBHOOK_URL: "",
  };
  try {
    const c = await run("notion-log/collect-sessions.js", ["--date", "2026-10-14"], env);
    assert.equal(c.code, 0, c.out);
    const sessionsFile = c.out.match(/sessions: (.+)/)[1].trim();
    const analysisFile = c.out.match(/analysis: (.+)/)[1].trim();
    assert.ok(!readFileSync(sessionsFile, "utf-8").includes("abc123secret"));

    const many = Array.from({ length: 250 }, (_, i) => `- 항목 ${i}`).join("\n");
    writeFileSync(analysisFile, JSON.stringify({ summary: "요약", details: many, topics: [{ name: "배포", tags: ["app"], details: "- v2" }] }));
    const r = await run("notion-log/log-all-sessions.js", ["--date", "2026-10-14"], env);
    assert.equal(r.code, 0, r.out);
    assert.equal(children.get("p1").length, 251); // 안내 1 + 항목 250
    assert.ok(calls.filter((x) => x.url === "/pages").length >= 4); // 429 1번 + 일별·대화·주제
    assert.ok(!existsSync(sessionsFile) && !existsSync(analysisFile));
    assert.ok(existsSync(join(dir, "cfg", "state", "notion-log-done-2026-10-14")));
  } finally {
    server.close();
  }
});

test("설정이 없으면 /hsc:setting 안내와 함께 exit 2", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hsc-test-"));
  const r = await run("digest/digest-to-notion.js", [], {
    HOME: dir, HSC_CONFIG_DIR: join(dir, "cfg"), NOTION_API_KEY: "", DIGEST_DB_ID: "",
  });
  assert.equal(r.code, 2);
  assert.match(r.out, /\/hsc:setting/);
});
