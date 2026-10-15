// SessionStart hook: 어제 대화가 있는데 Notion에 아직 기록하지 않았으면 하루 한 번 한 줄로 알린다.
// 조용히 넘어가는 경우: notion-log 설정 없음, 자동 수집(launchd) 등록됨, 알림 끔, 이미 기록함, 오늘 이미 알림.
// 어떤 오류도 세션 시작을 막지 않는다.
import { existsSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { CONFIG_DIR, loadConfig, missingFor, statePath } from "../lib/config.js";
import { listSessionFiles, localDate, readConversations, startOfLocalDay } from "../lib/sessions.js";

try {
  const cfg = loadConfig();
  const today = localDate();
  const yesterday = localDate(Date.now() - 864e5);
  const scheduled = existsSync(join(homedir(), "Library", "LaunchAgents", "com.claude.notion-logger.plist")) &&
    existsSync(join(CONFIG_DIR, "daily-log.sh"));
  const off = /^(off|false|0|no)$/i.test(cfg.NOTION_LOG_REMINDER || "");

  if (!missingFor("notion-log", cfg).length && !scheduled && !off &&
      !existsSync(statePath(`notion-log-done-${yesterday}`)) &&
      !existsSync(statePath(`reminded-${today}`))) {
    const from = startOfLocalDay(yesterday);
    const to = startOfLocalDay(today);
    // 어제 끝난 세션이 있으면 바로 참. 오늘까지 이어진 세션은 어제 날짜 대화가 있는지 열어 본다.
    const recent = listSessionFiles({ modifiedSince: from });
    const hadSessions = recent.some((f) => f.mtime < to) ||
      recent.some((f) => readConversations(f.filePath, { date: yesterday }).conversations.length > 0);
    if (hadSessions) {
      writeFileSync(statePath(`reminded-${today}`), "");
      console.log(JSON.stringify({
        systemMessage: `📝 어제(${yesterday}) Claude Code 기록이 Notion에 없습니다 → /hsc:notion-log ${yesterday}  (알림 끄기: /hsc:setting)`,
      }));
    }
  }
} catch {
  // 알림은 부가 기능이라 실패해도 아무것도 출력하지 않는다
}
