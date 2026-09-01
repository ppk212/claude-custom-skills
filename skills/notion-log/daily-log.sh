#!/bin/bash
# Claude Code Daily Logger — launchd에서 매일 00:00에 실행
# Claude Code CLI를 사용하여 어제 세션을 분석 + Notion 기록 + Slack 알림

LOGGER_DIR="$HOME/.claude-notion-logger"
cd "$LOGGER_DIR"

# 어제 날짜 계산
YESTERDAY=$(date -v-1d +%Y-%m-%d)

LOG_FILE="$LOGGER_DIR/logs/daily-$(date +%Y-%m-%d).log"
mkdir -p "$LOGGER_DIR/logs"

NODE_PATH="/Users/ihyeonsu/.nvm/versions/node/v26.3.0/bin/node"
CLAUDE_PATH="/Users/ethan.lee/.nvm/versions/node/v20.19.2/bin/claude"

{
  echo "=== Daily Log Start: $(date) ==="
  echo "Target date: $YESTERDAY"

  # 1. 어제 세션이 있는지 먼저 확인
  $NODE_PATH collect-sessions.js --date "$YESTERDAY" 2>&1

  SESSIONS_FILE="/tmp/notion-sessions-${YESTERDAY}.json"
  if [ ! -f "$SESSIONS_FILE" ]; then
    echo "세션 파일이 생성되지 않았습니다. 종료."
    exit 0
  fi

  SESSION_COUNT=$(cat "$SESSIONS_FILE" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('sessions',[])))")
  if [ "$SESSION_COUNT" = "0" ]; then
    echo "어제 세션이 없습니다. 종료."
    exit 0
  fi

  echo "세션 ${SESSION_COUNT}개 발견. Claude Code로 /hsc:notion-log 실행..."

  # 2. Claude Code CLI로 /hsc:notion-log 스킬 실행
  $CLAUDE_PATH -p "/hsc:notion-log $YESTERDAY" 2>&1

  echo "=== Daily Log End: $(date) ==="
} >> "$LOG_FILE" 2>&1
