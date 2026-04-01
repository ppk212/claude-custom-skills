#!/bin/bash
# ============================================================
# Claude Custom Skills — 원클릭 세팅 스크립트
# 사용법: git clone <repo> && cd claude-custom-skills && ./setup.sh
# ============================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
NOTION_SKILL_DIR="$REPO_DIR/skills/notion-log"
NOTION_INSTALL_DIR="$HOME/.claude-notion-logger"
DIGEST_SKILL_DIR="$REPO_DIR/skills/digest"
DIGEST_INSTALL_DIR="$HOME/.claude-digest"

echo "🚀 Claude Custom Skills 세팅 시작"
echo "   레포 경로: $REPO_DIR"
echo ""

# ============================================================
# 1. 환경 변수 설정 (.env)
# ============================================================

if [ -f "$NOTION_SKILL_DIR/.env" ]; then
  echo "✅ .env 파일이 이미 존재합니다."
else
  echo "📝 .env 파일 설정"
  echo ""

  # 기본값 (수정 가능)
  DEFAULT_NOTION_API_KEY=""
  DEFAULT_DAILY_DB_ID=""
  DEFAULT_TOPIC_DB_ID=""
  DEFAULT_SLACK_WEBHOOK_URL=""

  read -p "  Notion API Key: " NOTION_API_KEY
  NOTION_API_KEY=${NOTION_API_KEY:-$DEFAULT_NOTION_API_KEY}

  read -p "  Daily DB ID (클로드 사용 기록): " DAILY_DB_ID
  DAILY_DB_ID=${DAILY_DB_ID:-$DEFAULT_DAILY_DB_ID}

  read -p "  Topic DB ID (주제별 기록): " TOPIC_DB_ID
  TOPIC_DB_ID=${TOPIC_DB_ID:-$DEFAULT_TOPIC_DB_ID}

  read -p "  Slack Webhook URL (없으면 Enter): " SLACK_WEBHOOK_URL
  SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-$DEFAULT_SLACK_WEBHOOK_URL}

  read -p "  Digest DB ID (주제별 종합 문서): " DIGEST_DB_ID
  DIGEST_DB_ID=${DIGEST_DB_ID:-""}

  cat > "$NOTION_SKILL_DIR/.env" << EOF
NOTION_API_KEY=$NOTION_API_KEY
DAILY_DB_ID=$DAILY_DB_ID
TOPIC_DB_ID=$TOPIC_DB_ID
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL
EOF

  cat > "$DIGEST_SKILL_DIR/.env" << EOF
NOTION_API_KEY=$NOTION_API_KEY
DIGEST_DB_ID=$DIGEST_DB_ID
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL
EOF

  echo "  ✅ .env 생성 완료 (notion-log + digest)"
fi

# ============================================================
# 2. Node.js 의존성 설치
# ============================================================

echo ""
echo "📦 Node.js 의존성 설치..."

# Node.js 경로 확인
NODE_PATH=$(which node 2>/dev/null)
if [ -z "$NODE_PATH" ]; then
  echo "❌ Node.js를 찾을 수 없습니다. 먼저 Node.js를 설치해주세요."
  exit 1
fi
echo "  Node.js: $NODE_PATH"

cd "$NOTION_SKILL_DIR"
npm install --silent 2>&1
echo "  ✅ notion-log 의존성 설치 완료"

cd "$DIGEST_SKILL_DIR"
npm install --silent 2>&1
echo "  ✅ digest 의존성 설치 완료"

# ============================================================
# 3. 심링크 생성 (~/.claude-notion-logger → skills/notion-log)
# ============================================================

echo ""
echo "🔗 심링크 생성..."

if [ -L "$NOTION_INSTALL_DIR" ]; then
  rm "$NOTION_INSTALL_DIR"
  echo "  기존 심링크 제거"
elif [ -d "$NOTION_INSTALL_DIR" ]; then
  echo "  ⚠️  기존 디렉토리 발견: $NOTION_INSTALL_DIR"
  read -p "  기존 디렉토리를 백업하고 심링크로 교체할까요? (y/n): " REPLACE
  if [ "$REPLACE" = "y" ]; then
    mv "$NOTION_INSTALL_DIR" "${NOTION_INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
    echo "  📁 백업 완료"
  else
    echo "  취소. 수동으로 처리해주세요."
    exit 1
  fi
fi

ln -s "$NOTION_SKILL_DIR" "$NOTION_INSTALL_DIR"
echo "  ✅ $NOTION_INSTALL_DIR → $NOTION_SKILL_DIR"

if [ -L "$DIGEST_INSTALL_DIR" ]; then
  rm "$DIGEST_INSTALL_DIR"
elif [ -d "$DIGEST_INSTALL_DIR" ]; then
  mv "$DIGEST_INSTALL_DIR" "${DIGEST_INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
fi

ln -s "$DIGEST_SKILL_DIR" "$DIGEST_INSTALL_DIR"
echo "  ✅ $DIGEST_INSTALL_DIR → $DIGEST_SKILL_DIR"

# 로그 디렉토리 생성
mkdir -p "$NOTION_SKILL_DIR/logs"

# ============================================================
# 4. Claude Code 커맨드 설치
# ============================================================

echo ""
echo "📝 Claude Code 커맨드 설치..."

mkdir -p "$CLAUDE_DIR/commands"

# notion-log 커맨드
cp "$NOTION_SKILL_DIR/claude-commands/notion-log.md" "$CLAUDE_DIR/commands/notion-log.md"
echo "  ✅ /notion-log 커맨드 설치"

# digest 커맨드
cp "$DIGEST_SKILL_DIR/claude-commands/digest.md" "$CLAUDE_DIR/commands/digest.md"
echo "  ✅ /digest 커맨드 설치"

# ============================================================
# 5. Claude Code Hook 설정
# ============================================================

echo ""
echo "🪝 Stop Hook 설정..."

chmod +x "$NOTION_SKILL_DIR/stop-hook.sh"
chmod +x "$NOTION_SKILL_DIR/daily-log.sh"

# settings.json에 Hook 추가 (이미 있으면 건너뛰기)
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
  if grep -q "stop-hook.sh" "$SETTINGS_FILE"; then
    echo "  ✅ Stop Hook 이미 설정됨"
  else
    echo "  ⚠️  settings.json에 수동으로 Stop Hook을 추가해주세요:"
    echo "     Hook command: $NOTION_INSTALL_DIR/stop-hook.sh"
  fi
else
  cat > "$SETTINGS_FILE" << EOF
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "Agent"
    ],
    "deny": [
      "Bash(git commit*)",
      "Bash(git push*)"
    ]
  },
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "$NOTION_INSTALL_DIR/stop-hook.sh"
          }
        ]
      }
    ]
  }
}
EOF
  echo "  ✅ settings.json 생성 (Hook + 권한 설정)"
fi

# ============================================================
# 6. daily-log.sh Node.js 경로 업데이트
# ============================================================

echo ""
echo "🔧 daily-log.sh Node.js 경로 업데이트..."

# 현재 Node.js 절대 경로로 교체
sed -i '' "s|/Users/ethan.lee/.nvm/versions/node/v20.19.2/bin/node|$NODE_PATH|g" "$NOTION_SKILL_DIR/daily-log.sh" 2>/dev/null || true
echo "  ✅ Node.js 경로: $NODE_PATH"

# ============================================================
# 7. launchd 일일 자동 수집 설정
# ============================================================

echo ""
echo "⏰ launchd 일일 자동 수집 설정..."

PLIST_NAME="com.claude.notion-logger"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
NODE_DIR=$(dirname "$NODE_PATH")

# 기존 plist 언로드
launchctl unload "$PLIST_PATH" 2>/dev/null || true

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${INSTALL_DIR}/daily-log.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>0</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${INSTALL_DIR}/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL_DIR}/logs/launchd-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>PATH</key>
        <string>${NODE_DIR}:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"
echo "  ✅ 매일 00:00 자동 실행 등록"

# ============================================================
# 완료
# ============================================================

echo ""
echo "============================================================"
echo "🎉 세팅 완료!"
echo ""
echo "사용법:"
echo "  /notion-log              오늘 세션 Notion에 기록"
echo "  /notion-log 2026-03-30   특정 날짜 기록"
echo "  /digest <주제>           주제별 종합 문서 생성"
echo ""
echo "자동 실행:"
echo "  매일 00:00 — 어제 세션 자동 수집 → Notion + Slack"
echo ""
echo "관리:"
echo "  launchctl list | grep claude    상태 확인"
echo "  cat ~/.claude-notion-logger/logs/   로그 확인"
echo "============================================================"
