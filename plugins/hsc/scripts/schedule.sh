#!/bin/bash
# notion-log 매일 자동 수집 (macOS launchd). 플러그인은 스케줄을 등록할 수 없어서 이 스크립트가 맡는다.
#   bash schedule.sh install     매일 00:00 에 어제 대화를 /hsc:notion-log 로 기록
#   bash schedule.sh uninstall   등록 해제
#   bash schedule.sh status
#
# 플러그인 폴더는 버전마다 경로가 바뀌므로 실행 스크립트는 설정 폴더(~/.config/hsc)에 만든다.
# 실행 스크립트는 claude -p 로 /hsc:notion-log 를 부르기만 하므로 플러그인이 업데이트돼도 그대로 동작한다.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HSC_CONFIG_DIR:-$HOME/.config/hsc}"
RUNNER="$CONFIG_DIR/daily-log.sh"
LABEL="com.claude.notion-logger"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

case "${1:-status}" in
  install)
    [ "$(uname)" = Darwin ] || { echo "macOS(launchd)에서만 지원합니다. 다른 OS는 cron에 매일 'claude -p \"/hsc:notion-log <어제 날짜>\"'를 등록하세요."; exit 1; }
    node "$ROOT/scripts/config.js" has notion-log || {
      echo "❌ Notion 설정이 없습니다. Claude Code에서 /hsc:setting 을 먼저 실행하세요."; exit 1; }
    CLAUDE_BIN=$(command -v claude) || { echo "❌ claude CLI를 PATH에서 찾을 수 없습니다."; exit 1; }
    NODE_BIN=$(command -v node)
    mkdir -p "$CONFIG_DIR/logs" "$HOME/Library/LaunchAgents"
    cat > "$RUNNER" <<RUN
#!/bin/bash
# schedule.sh install 이 만든 파일. 어제 대화가 있으면 /hsc:notion-log 로 기록한다.
YESTERDAY=\$(date -v-1d +%Y-%m-%d)
LOG="$CONFIG_DIR/logs/daily-\$(date +%Y-%m).log"
{
  echo "=== \$(date) target=\$YESTERDAY ==="
  if [ -f "$CONFIG_DIR/state/notion-log-done-\$YESTERDAY" ]; then echo "이미 기록됨. 종료."; exit 0; fi
  N=\$(find "\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}/projects" -maxdepth 2 -name '*.jsonl' -newermt "\$YESTERDAY" 2>/dev/null | wc -l | tr -d ' ')
  if [ "\$N" = 0 ]; then echo "어제 이후 세션 없음. 종료."; exit 0; fi
  "$CLAUDE_BIN" -p "/hsc:notion-log \$YESTERDAY" --allowedTools "Bash(node:*)" "Read" "Write"
  echo "=== 끝 \$(date) ==="
} >> "\$LOG" 2>&1
RUN
    chmod +x "$RUNNER"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$RUNNER</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$CONFIG_DIR/logs/launchd-stdout.log</string>
  <key>StandardErrorPath</key><string>$CONFIG_DIR/logs/launchd-stderr.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>$(dirname "$CLAUDE_BIN"):$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PL
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "✅ 매일 00:00 자동 수집 등록 (로그: $CONFIG_DIR/logs/)"
    ;;
  uninstall)
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST" "$RUNNER"
    echo "✅ 자동 수집 해제"
    ;;
  status)
    if launchctl list 2>/dev/null | grep -q "$LABEL"; then echo "등록됨: $PLIST → $RUNNER"; else echo "등록 안 됨"; fi
    ;;
  *) sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
