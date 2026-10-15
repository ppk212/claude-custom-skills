// hsc 설정 도구. /hsc:setting 이 이 스크립트로 읽고 쓴다 (값을 대화에 그대로 출력하지 않기 위해).
//   node config.js status              설정 상태 (값은 가려서)
//   node config.js set KEY=VALUE ...   저장 (빈 값이면 삭제)
//   node config.js test                Notion 키·DB 연결 확인
//   node config.js has <notion-log|digest>   필요한 값이 다 있으면 exit 0
//   node config.js prompt            터미널에서 직접 입력 (키를 채팅에 남기지 않을 때)
//   node config.js path
import { CONFIG_FILE, KEYS, REQUIRED, loadConfig, maskValue, missingFor, saveConfig } from "../lib/config.js";
import { createInterface } from "readline";
import { main } from "../lib/common.js";
import { createNotion } from "../lib/notion.js";

const [cmd, ...rest] = process.argv.slice(2);

const DB_KEYS = ["DAILY_DB_ID", "TOPIC_DB_ID", "DIGEST_DB_ID"];

main(async () => {
  switch (cmd) {
    case "status": {
      const cfg = loadConfig();
      console.log(`설정 파일: ${CONFIG_FILE}\n`);
      console.log("| 항목 | 상태 | 값 |\n|---|---|---|");
      for (const [k, label] of Object.entries(KEYS)) {
        const optional = k === "SLACK_WEBHOOK_URL" || k === "NOTION_LOG_REMINDER";
        const state = cfg[k] ? "✅ 설정됨" : optional ? "⏭️ 선택" : "❌ 미설정";
        console.log(`| ${label} | ${state} | ${cfg[k] ? `\`${maskValue(cfg[k])}\`` : "—"} |`);
      }
      console.log("");
      for (const f of Object.keys(REQUIRED)) {
        const miss = missingFor(f, cfg);
        console.log(`/hsc:${f}: ${miss.length ? `사용 불가 (없음: ${miss.join(", ")})` : "사용 가능"}`);
      }
      break;
    }
    case "set": {
      const updates = {};
      for (const pair of rest) {
        const i = pair.indexOf("=");
        const k = i === -1 ? pair : pair.slice(0, i);
        if (!(k in KEYS)) throw new Error(`알 수 없는 키: ${k} (가능: ${Object.keys(KEYS).join(", ")})`);
        let v = i === -1 ? "" : pair.slice(i + 1).trim();
        if (DB_KEYS.includes(k)) v = normalizeDbId(v);
        updates[k] = v;
      }
      saveConfig(updates);
      console.log(`✅ 저장: ${Object.keys(updates).join(", ")} → ${CONFIG_FILE}`);
      break;
    }
    case "test": {
      const cfg = loadConfig();
      if (!cfg.NOTION_API_KEY) throw new Error("NOTION_API_KEY 가 없습니다.");
      const notion = createNotion(cfg.NOTION_API_KEY);
      let failed = 0;
      for (const k of DB_KEYS) {
        if (!cfg[k]) continue;
        try {
          const db = await notion.getDatabase(cfg[k]);
          const name = db.title?.map((t) => t.plain_text).join("") || "(제목 없음)";
          console.log(`✅ ${k}: "${name}" 접근 가능`);
        } catch (e) {
          failed++;
          const hint = /404/.test(e.message)
            ? "DB가 없거나 Integration이 연결되지 않았습니다 (DB 페이지 ⋯ → 연결 → Integration 추가)"
            : /401/.test(e.message)
              ? "API Key가 올바르지 않습니다"
              : e.message;
          console.log(`❌ ${k}: ${hint}`);
        }
      }
      if (failed) process.exit(1);
      break;
    }
    case "prompt": {
      // 터미널에서 직접 입력 (키를 채팅에 붙여 넣지 않으려는 경우). 입력 값은 화면에 표시하지 않는다.
      const cfg = loadConfig();
      const updates = {};
      for (const [k, label] of Object.entries(KEYS)) {
        if (k === "NOTION_LOG_REMINDER") continue;
        const now = cfg[k] ? ` [현재 ${maskValue(cfg[k])}, Enter=유지]` : " [Enter=건너뜀]";
        const v = (await ask(`${label}${now}: `, k !== "SLACK_WEBHOOK_URL" && !DB_KEYS.includes(k))).trim();
        if (v) updates[k] = DB_KEYS.includes(k) ? normalizeDbId(v) : v;
      }
      if (Object.keys(updates).length) saveConfig(updates);
      console.log(`✅ 저장했습니다 (${CONFIG_FILE}). Claude Code에서 /hsc:setting check 로 확인하세요.`);
      break;
    }
    case "has":
      process.exit(missingFor(rest[0]).length ? 1 : 0);
    case "path":
      console.log(CONFIG_FILE);
      break;
    default:
      console.log("사용법: node config.js status | set KEY=VALUE ... | test | prompt | has <notion-log|digest> | path");
      process.exit(cmd ? 2 : 0);
  }
});

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s === question || s.includes("\n")) process.stdout.write(s);
      };
    }
    rl.question(question, (v) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(v);
    });
  });
}

// Notion DB URL을 붙여넣어도 32자리 ID만 뽑는다
function normalizeDbId(v) {
  const m = v.replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return m ? m[0] : v;
}
