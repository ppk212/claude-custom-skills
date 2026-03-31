#!/bin/bash
# Claude Code Daily Logger — launchd에서 매일 00:00에 실행
# 어제 날짜의 세션을 수집하여 Notion + Slack에 기록

set -e

LOGGER_DIR="$HOME/.claude-notion-logger"
cd "$LOGGER_DIR"

# 어제 날짜 계산
YESTERDAY=$(date -v-1d +%Y-%m-%d)

LOG_FILE="$LOGGER_DIR/logs/daily-$(date +%Y-%m-%d).log"
mkdir -p "$LOGGER_DIR/logs"

{
  echo "=== Daily Log Start: $(date) ==="
  echo "Target date: $YESTERDAY"

  # 1. 어제 세션 수집
  /Users/ethan.lee/.nvm/versions/node/v20.19.2/bin/node collect-sessions.js --date "$YESTERDAY" 2>&1

  SESSIONS_FILE="/tmp/notion-sessions-${YESTERDAY}.json"
  if [ ! -f "$SESSIONS_FILE" ]; then
    echo "세션 파일이 생성되지 않았습니다. 종료."
    exit 0
  fi

  # 세션이 비어있는지 확인
  SESSION_COUNT=$(cat "$SESSIONS_FILE" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('sessions',[])))")
  if [ "$SESSION_COUNT" = "0" ]; then
    echo "어제 세션이 없습니다. 종료."
    exit 0
  fi

  # 2. Notion에 기록 (analysis 파일 없이 — 자동 요약 사용)
  #    analysis 파일이 있으면 사용, 없으면 기본 요약
  /Users/ethan.lee/.nvm/versions/node/v20.19.2/bin/node log-all-sessions.js "$SESSIONS_FILE" 2>&1

  echo "=== Daily Log End: $(date) ==="
} >> "$LOG_FILE" 2>&1
