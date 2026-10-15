#!/bin/bash
# notion-log 매일 자동 수집 (macOS launchd). 플러그인은 스케줄을 등록할 수 없어서 이 스크립트가 맡는다.
#   bash schedule.sh install     매일 00:00 에 어제 세션을 /hsc:notion-log 로 기록
#   bash schedule.sh uninstall   등록 해제
#   bash schedule.sh status
#
# 플러그인 폴더는 버전마다 경로가 바뀌므로, 실행 스크립트는 ~/.claude-notion-logger 에 만들어 둔다.
set -e

HOME_DIR="$HOME/.claude-notion-logger"
RUNNER="$HOME_DIR/daily-log.sh"
LABEL="com.claude.notion-logger"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

case "${1:-status}" in
  install)
    [ "$(uname)" = Darwin ] || { echo "macOS(launchd)에서만 지원합니다. 다른 OS는 cron에 '$RUNNER'를 등록하세요."; }
    grep -qE '^NOTION_API_KEY=.+' "$HOME_DIR/.env" 2>/dev/null || {
      echo "❌ $HOME_DIR/.env 에 NOTION_API_KEY가 없습니다. Claude Code에서 /hsc:setting 을 먼저 실행하세요."; exit 1; }
    CLAUDE_BIN=$(command -v claude) || { echo "❌ claude CLI를 PATH에서 찾을 수 없습니다."; exit 1; }
    mkdir -p "$HOME_DIR/logs" "$HOME/Library/LaunchAgents"
    cat > "$RUNNER" <<RUN
#!/bin/bash
# schedule.sh install 이 만든 파일. 어제 세션이 있으면 /hsc:notion-log 로 기록한다.
YESTERDAY=\$(date -v-1d +%Y-%m-%d)
TODAY=\$(date +%Y-%m-%d)
LOG="$HOME_DIR/logs/daily-\$TODAY.log"
{
  echo "=== \$(date) target=\$YESTERDAY ==="
  N=\$(find "\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}/projects" -name '*.jsonl' -newermt "\$YESTERDAY" 2>/dev/null | wc -l | tr -d ' ')
  if [ "\$N" = 0 ]; then echo "어제 이후 세션 없음. 종료."; exit 0; fi
  "$CLAUDE_BIN" -p "/hsc:notion-log \$YESTERDAY"
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
  <key>StandardOutPath</key><string>$HOME_DIR/logs/launchd-stdout.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/logs/launchd-stderr.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>$(dirname "$CLAUDE_BIN"):$(dirname "$(command -v node || echo /usr/local/bin/node)"):/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PL
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "✅ 매일 00:00 자동 수집 등록 ($PLIST)"
    ;;
  uninstall)
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST" "$RUNNER"
    echo "✅ 자동 수집 해제"
    ;;
  status)
    if launchctl list 2>/dev/null | grep -q "$LABEL"; then echo "등록됨: $PLIST"; else echo "등록 안 됨"; fi
    ;;
  *) sed -n '2,6p' "$0"; exit 2 ;;
esac
