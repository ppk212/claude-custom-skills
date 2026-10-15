// hsc 설정: ~/.config/hsc/.env 하나에 모든 키를 둔다.
// 플러그인 폴더는 업데이트 때마다 새로 받으므로 설정은 플러그인 밖에 있어야 한다.
// 예전 위치(~/.claude-notion-logger/.env, ~/.claude-digest/.env)도 읽기만 한다.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const CONFIG_DIR = process.env.HSC_CONFIG_DIR || join(homedir(), ".config", "hsc");
export const CONFIG_FILE = join(CONFIG_DIR, ".env");
export const STATE_DIR = join(CONFIG_DIR, "state");
const LEGACY_FILES = [
  join(homedir(), ".claude-notion-logger", ".env"),
  join(homedir(), ".claude-digest", ".env"),
];

export const KEYS = {
  NOTION_API_KEY: "Notion API Key",
  DAILY_DB_ID: "Daily DB ID (일별 기록)",
  TOPIC_DB_ID: "Topic DB ID (주제별 기록)",
  DIGEST_DB_ID: "Digest DB ID (주제별 종합 문서)",
  SLACK_WEBHOOK_URL: "Slack Webhook URL (선택)",
  NOTION_LOG_REMINDER: "어제 기록 알림 on/off (선택, 기본 on)",
};

// 기능별로 꼭 있어야 하는 키
export const REQUIRED = {
  "notion-log": ["NOTION_API_KEY", "DAILY_DB_ID", "TOPIC_DB_ID"],
  digest: ["NOTION_API_KEY", "DIGEST_DB_ID"],
};

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (v !== "") out[m[1]] = v;
  }
  return out;
}

// 파일에 저장된 값 (예전 위치 → 현재 위치 순으로 덮어씀)
function loadFileConfig() {
  const merged = {};
  for (const f of LEGACY_FILES) Object.assign(merged, parseEnvFile(f));
  Object.assign(merged, parseEnvFile(CONFIG_FILE));
  return merged;
}

// 실행 시 쓰는 값. 환경 변수가 있으면 파일보다 우선한다.
export function loadConfig() {
  const merged = loadFileConfig();
  for (const k of Object.keys(KEYS)) if (process.env[k]) merged[k] = process.env[k];
  return merged;
}

export function missingFor(feature, cfg = loadConfig()) {
  return (REQUIRED[feature] || []).filter((k) => !cfg[k]);
}

// 스크립트 시작부에서 호출. 빠진 키가 있으면 무엇을 하면 되는지 알려주고 끝낸다.
export function requireConfig(feature) {
  const cfg = loadConfig();
  const missing = missingFor(feature, cfg);
  if (missing.length) {
    console.error(`❌ 설정이 없습니다: ${missing.join(", ")}`);
    console.error(`   Claude Code에서 /hsc:setting 을 실행하세요. (설정 파일: ${CONFIG_FILE})`);
    process.exit(2);
  }
  return cfg;
}

export function saveConfig(updates) {
  const current = loadFileConfig();
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") delete current[k];
    else current[k] = v;
  }
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const body = Object.keys(KEYS)
    .filter((k) => current[k])
    .map((k) => `${k}=${current[k]}`)
    .join("\n");
  writeFileSync(CONFIG_FILE, body + "\n", { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

export function maskValue(v) {
  if (!v) return "";
  return v.length <= 8 ? "***" : `${v.slice(0, 4)}***${v.slice(-2)}`;
}

export function statePath(name) {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  return join(STATE_DIR, name);
}
