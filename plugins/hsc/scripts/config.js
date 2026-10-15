// hsc 설정 진단. 값 입력은 /plugin → hsc → Configure options 에서 한다.
//   node config.js status --data-dir <플러그인 데이터 폴더>   상태 (값은 가려서)
//   node config.js test --data-dir <플러그인 데이터 폴더>     Notion 키·DB 접근 확인
import { CONFIGURE_HINT, OPTIONS, REQUIRED, isOn, loadConfig, maskValue, missingFor } from "../lib/config.js";
import { main } from "../lib/common.js";
import { createNotion } from "../lib/notion.js";

const DB_KEYS = ["DAILY_DB_ID", "TOPIC_DB_ID", "DIGEST_DB_ID"];
const cmd = process.argv[2];

main(async () => {
  const cfg = loadConfig();
  if (cmd === "status") {
    console.log("| 설정 | 값 |\n|---|---|");
    for (const [k, opt] of Object.entries(OPTIONS)) {
      const v = k === "DAILY_AUTO_LOG" ? (isOn(cfg[k]) ? "켜짐" : "꺼짐")
        : k === "YESTERDAY_REMINDER" ? (isOn(cfg[k], true) ? "켜짐" : "꺼짐")
        : cfg[k] ? `\`${maskValue(cfg[k])}\`` : "—";
      console.log(`| ${opt} | ${v} |`);
    }
    console.log("");
    for (const f of Object.keys(REQUIRED)) {
      const miss = missingFor(f, cfg);
      console.log(`/hsc:${f}: ${miss.length ? `사용 불가 (없음: ${miss.map((k) => OPTIONS[k]).join(", ")})` : "사용 가능"}`);
    }
    if (Object.keys(REQUIRED).some((f) => missingFor(f, cfg).length)) console.log(`\n${CONFIGURE_HINT}`);
  } else if (cmd === "test") {
    if (!cfg.NOTION_API_KEY) throw new Error(`notion_api_key 가 없습니다. ${CONFIGURE_HINT}`);
    const notion = createNotion(cfg.NOTION_API_KEY);
    let failed = 0;
    for (const k of DB_KEYS) {
      if (!cfg[k]) continue;
      try {
        const db = await notion.getDatabase(cfg[k]);
        console.log(`✅ ${OPTIONS[k]}: "${db.title?.map((t) => t.plain_text).join("") || "(제목 없음)"}" 접근 가능`);
      } catch (e) {
        failed++;
        const hint = / 404/.test(e.message)
          ? "DB가 없거나 Integration이 연결되지 않았습니다 (DB 페이지 ⋯ → 연결 → Integration 추가)"
          : / 401/.test(e.message) ? "API 키가 올바르지 않습니다" : e.message;
        console.log(`❌ ${OPTIONS[k]}: ${hint}`);
      }
    }
    if (failed) process.exit(1);
  } else {
    console.log("사용법: node config.js status | test");
    process.exit(cmd ? 2 : 0);
  }
});
