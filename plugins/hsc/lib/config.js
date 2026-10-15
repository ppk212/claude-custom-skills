// hsc 설정. 값은 플러그인 설정 창(/plugin → hsc → Configure options)에서 받는다.
// - Claude Code는 그 값을 hook에만 CLAUDE_PLUGIN_OPTION_<KEY> 환경 변수로 넘기고,
//   Claude가 Bash로 실행하는 스크립트에는 넘기지 않는다.
// - 그래서 SessionStart hook이 값을 플러그인 데이터 폴더의 config.json(0600)에 옮겨 두고,
//   notion-log·digest 스크립트는 그 파일을 읽는다. 값을 바꾸면 다음 세션부터 적용된다.
// - 예전 위치(~/.claude-notion-logger/.env, ~/.claude-digest/.env)는 값이 없을 때만 읽는다.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// 커맨드는 --data-dir "${CLAUDE_PLUGIN_DATA}" 로, hook은 CLAUDE_PLUGIN_DATA 환경 변수로 위치를 받는다
const argIdx = process.argv.indexOf("--data-dir");
export const DATA_DIR =
  (argIdx !== -1 && process.argv[argIdx + 1]) || process.env.HSC_DATA_DIR || process.env.CLAUDE_PLUGIN_DATA ||
  join(homedir(), ".claude", "plugins", "data", "hsc-hsc");
const CONFIG_JSON = join(DATA_DIR, "config.json");
const LEGACY_FILES = [
  join(homedir(), ".claude-notion-logger", ".env"),
  join(homedir(), ".claude-digest", ".env"),
];

// 스크립트에서 쓰는 이름 → plugin.json userConfig 키
export const OPTIONS = {
  NOTION_API_KEY: "notion_api_key",
  DAILY_DB_ID: "daily_db_id",
  TOPIC_DB_ID: "topic_db_id",
  DIGEST_DB_ID: "digest_db_id",
  SLACK_WEBHOOK_URL: "slack_webhook_url",
  DAILY_AUTO_LOG: "daily_auto_log",
  YESTERDAY_REMINDER: "yesterday_reminder",
};

export const REQUIRED = {
  "notion-log": ["NOTION_API_KEY", "DAILY_DB_ID", "TOPIC_DB_ID"],
  digest: ["NOTION_API_KEY", "DIGEST_DB_ID"],
};

export const CONFIGURE_HINT = "/plugin → Installed 탭 → hsc → Configure options 에서 입력한 뒤 새 세션에서 다시 실행하세요";

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== "") out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

// Notion DB URL을 넣어도 32자리 ID만 쓴다
function normalize(key, v) {
  if (v === undefined || v === null) return "";
  v = String(v).trim();
  if (/_DB_ID$/.test(key)) {
    const m = v.replace(/-/g, "").match(/[0-9a-f]{32}/i);
    if (m) return m[0];
  }
  return v;
}

// hook 전용: 플러그인 설정 값을 config.json 으로 옮긴다. 바뀐 게 있으면 true.
export function syncFromPluginOptions() {
  const next = {};
  for (const [k, opt] of Object.entries(OPTIONS)) {
    const v = normalize(k, process.env[`CLAUDE_PLUGIN_OPTION_${opt.toUpperCase()}`]);
    if (v) next[k] = v;
  }
  const prev = readJson(CONFIG_JSON);
  if (JSON.stringify(prev) === JSON.stringify(next)) return false;
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_JSON, JSON.stringify(next, null, 2), { mode: 0o600 });
  chmodSync(CONFIG_JSON, 0o600);
  return true;
}

// 우선순위: 환경 변수 > 플러그인 설정(config.json) > 예전 .env
export function loadConfig() {
  const cfg = {};
  for (const f of LEGACY_FILES) Object.assign(cfg, parseEnvFile(f));
  Object.assign(cfg, readJson(CONFIG_JSON));
  for (const k of Object.keys(OPTIONS)) if (process.env[k]) cfg[k] = process.env[k];
  return cfg;
}

export const isOn = (v, dflt = false) => (v === undefined || v === "" ? dflt : /^(true|1|yes|on)$/i.test(String(v)));

export function missingFor(feature, cfg = loadConfig()) {
  return (REQUIRED[feature] || []).filter((k) => !cfg[k]);
}

export function requireConfig(feature) {
  const cfg = loadConfig();
  const missing = missingFor(feature, cfg);
  if (missing.length) {
    console.error(`❌ 설정이 없습니다: ${missing.map((k) => OPTIONS[k]).join(", ")}`);
    console.error(`   ${CONFIGURE_HINT}`);
    process.exit(2);
  }
  return cfg;
}

export function maskValue(v) {
  if (!v) return "";
  return v.length <= 8 ? "***" : `${v.slice(0, 4)}***${v.slice(-2)}`;
}

export function statePath(name) {
  const dir = join(DATA_DIR, "state");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, name);
}
