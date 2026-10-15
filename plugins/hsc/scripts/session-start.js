// SessionStart hook. 세 가지를 하고, 할 말이 있을 때만 한 줄(systemMessage)을 낸다.
//  1. 플러그인 설정 값을 config.json 으로 옮긴다 (스크립트가 읽을 수 있게)
//  2. daily_auto_log 설정에 맞춰 매일 자동 기록(macOS launchd)을 켜거나 끈다
//  3. 자동 기록이 꺼져 있고 어제 대화가 기록되지 않았으면 하루 한 번 알린다
// 어떤 오류도 세션 시작을 막지 않는다.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { delimiter, join } from "path";
import { CONFIGURE_HINT, DATA_DIR, isOn, loadConfig, missingFor, statePath, syncFromPluginOptions } from "../lib/config.js";
import { listSessionFiles, localDate, readConversations, startOfLocalDay } from "../lib/sessions.js";

const LABEL = "com.claude.hsc.notion-log";
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const RUNNER = join(DATA_DIR, "daily-log.sh");
const messages = [];

function which(bin) {
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    const p = join(dir, bin);
    if (dir && existsSync(p)) return p;
  }
  return null;
}

function launchctl(...args) {
  try {
    execFileSync("launchctl", args, { stdio: "ignore" });
  } catch {
    // 이미 내려가 있는 등은 무시
  }
}

function installSchedule() {
  const claude = which("claude");
  const node = which("node");
  if (!claude) return messages.push("⚠️ hsc 자동 기록: claude CLI를 PATH에서 찾지 못해 켜지 못했습니다");
  mkdirSync(join(DATA_DIR, "logs"), { recursive: true, mode: 0o700 });
  writeFileSync(
    RUNNER,
    `#!/bin/bash
# hsc 플러그인이 만든 파일 (daily_auto_log). 어제 대화가 있고 아직 기록 전이면 /hsc:notion-log 를 실행한다.
Y=$(date -v-1d +%Y-%m-%d)
LOG="${DATA_DIR}/logs/daily-$(date +%Y-%m).log"
{
  echo "=== $(date) target=$Y ==="
  [ -f "${DATA_DIR}/state/notion-log-done-$Y" ] && { echo "이미 기록됨"; exit 0; }
  N=$(find "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects" -maxdepth 2 -name '*.jsonl' -newermt "$Y" 2>/dev/null | wc -l | tr -d ' ')
  [ "$N" = 0 ] && { echo "세션 없음"; exit 0; }
  "${claude}" -p "/hsc:notion-log $Y" --allowedTools "Bash(node:*)" "Read" "Write"
} >> "$LOG" 2>&1
`,
    { mode: 0o700 },
  );
  // 플러그인을 지워 데이터 폴더가 사라지면 스스로 등록을 해제한다
  const guard = `if [ -f "${RUNNER}" ]; then exec /bin/bash "${RUNNER}"; else launchctl unload "${PLIST}"; rm -f "${PLIST}"; fi`;
  const path = [claude, node].filter(Boolean).map((p) => p.replace(/\/[^/]+$/, "")).concat(["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"]);
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(
    PLIST,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string><string>${guard.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>0</integer></dict>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>${homedir()}</string>
    <key>PATH</key><string>${[...new Set(path)].join(":")}</string>
  </dict>
</dict>
</plist>
`,
  );
  launchctl("unload", PLIST);
  launchctl("load", PLIST);
  messages.push("⏰ hsc: 매일 00:00 자동 기록을 켰습니다 (끄기: /plugin → hsc → Configure options)");
}

function removeSchedule() {
  launchctl("unload", PLIST);
  rmSync(PLIST, { force: true });
  rmSync(RUNNER, { force: true });
  messages.push("⏰ hsc: 매일 자동 기록을 껐습니다");
}

try {
  syncFromPluginOptions();
  const cfg = loadConfig();
  const ready = missingFor("notion-log", cfg).length === 0;
  const wantAuto = isOn(cfg.DAILY_AUTO_LOG);
  const scheduled = existsSync(PLIST) && existsSync(RUNNER);

  if (process.platform === "darwin") {
    if (wantAuto && ready && !scheduled) installSchedule();
    else if (wantAuto && !ready && !existsSync(statePath(`auto-hint-${localDate()}`))) {
      writeFileSync(statePath(`auto-hint-${localDate()}`), "");
      messages.push(`⚠️ hsc 자동 기록: Notion 키와 DB ID가 없어 켜지 못했습니다. ${CONFIGURE_HINT}`);
    } else if (!wantAuto && existsSync(PLIST)) removeSchedule();
  }

  const today = localDate();
  const yesterday = localDate(Date.now() - 864e5);
  if (ready && !wantAuto && isOn(cfg.YESTERDAY_REMINDER, true) &&
      !existsSync(statePath(`notion-log-done-${yesterday}`)) && !existsSync(statePath(`reminded-${today}`))) {
    const from = startOfLocalDay(yesterday);
    const to = startOfLocalDay(today);
    const recent = listSessionFiles({ modifiedSince: from });
    const had = recent.some((f) => f.mtime < to) ||
      recent.some((f) => readConversations(f.filePath, { date: yesterday }).conversations.length > 0);
    if (had) {
      writeFileSync(statePath(`reminded-${today}`), "");
      messages.push(`📝 어제(${yesterday}) Claude Code 기록이 Notion에 없습니다 → /hsc:notion-log ${yesterday}`);
    }
  }
} catch {
  // 부가 기능이라 실패해도 조용히 넘어간다
}

if (messages.length) console.log(JSON.stringify({ systemMessage: messages.join("\n") }));
