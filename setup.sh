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

# 모든 입력이 선택이다. Notion 키 없이도 세팅은 끝까지 진행되고,
# 키가 필요한 스킬만 비활성으로 남는다. 어떤 스킬을 못 쓰게 되는지는
# 마지막 요약에서 알려준다.

if [ -f "$NOTION_SKILL_DIR/.env" ]; then
  echo "✅ .env 파일이 이미 존재합니다."
  # 기존 .env에서 키를 읽어 활성/비활성을 판단한다 (덮어쓰지 않는다).
  NOTION_API_KEY=$(grep -m1 '^NOTION_API_KEY=' "$NOTION_SKILL_DIR/.env" | cut -d= -f2-)
  DAILY_DB_ID=$(grep -m1 '^DAILY_DB_ID=' "$NOTION_SKILL_DIR/.env" | cut -d= -f2-)
  TOPIC_DB_ID=$(grep -m1 '^TOPIC_DB_ID=' "$NOTION_SKILL_DIR/.env" | cut -d= -f2-)
  SLACK_WEBHOOK_URL=$(grep -m1 '^SLACK_WEBHOOK_URL=' "$NOTION_SKILL_DIR/.env" | cut -d= -f2-)
  if [ -f "$DIGEST_SKILL_DIR/.env" ]; then
    DIGEST_DB_ID=$(grep -m1 '^DIGEST_DB_ID=' "$DIGEST_SKILL_DIR/.env" | cut -d= -f2-)
  else
    DIGEST_DB_ID=""
  fi
else
  echo "📝 .env 파일 설정"
  echo ""
  echo "  전부 선택 입력입니다. 그냥 Enter로 건너뛰면 해당 스킬만 비활성화되고"
  echo "  나머지 세팅은 정상 진행됩니다. 나중에 .env를 채우고 다시 실행하면 됩니다."
  echo ""

  read -p "  Notion API Key (Enter=건너뜀): " NOTION_API_KEY || true
  read -p "  Daily DB ID  (클로드 사용 기록, Enter=건너뜀): " DAILY_DB_ID || true
  read -p "  Topic DB ID  (주제별 기록, Enter=건너뜀): " TOPIC_DB_ID || true
  read -p "  Digest DB ID (주제별 종합 문서, Enter=건너뜀): " DIGEST_DB_ID || true
  read -p "  Slack Webhook URL (Enter=건너뜀): " SLACK_WEBHOOK_URL || true

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

  echo ""
  echo "  ✅ .env 생성 완료 (notion-log + digest)"
fi

# ------------------------------------------------------------
# 스킬별 활성 조건 판정 — 이후 단계와 최종 요약이 이 플래그를 쓴다
# ------------------------------------------------------------

NOTION_LOG_ENABLED=false
DIGEST_ENABLED=false
SLACK_ENABLED=false
DISABLED_REASONS=()

if [ -n "$NOTION_API_KEY" ] && [ -n "$DAILY_DB_ID" ] && [ -n "$TOPIC_DB_ID" ]; then
  NOTION_LOG_ENABLED=true
else
  MISSING=""
  [ -z "$NOTION_API_KEY" ] && MISSING="${MISSING}NOTION_API_KEY "
  [ -z "$DAILY_DB_ID" ]    && MISSING="${MISSING}DAILY_DB_ID "
  [ -z "$TOPIC_DB_ID" ]    && MISSING="${MISSING}TOPIC_DB_ID "
  DISABLED_REASONS+=("/hsc:notion-log|없는 값: ${MISSING%% }|skills/notion-log/.env")
fi

if [ -n "$NOTION_API_KEY" ] && [ -n "$DIGEST_DB_ID" ]; then
  DIGEST_ENABLED=true
else
  MISSING=""
  [ -z "$NOTION_API_KEY" ] && MISSING="${MISSING}NOTION_API_KEY "
  [ -z "$DIGEST_DB_ID" ]   && MISSING="${MISSING}DIGEST_DB_ID "
  DISABLED_REASONS+=("/hsc:digest|없는 값: ${MISSING%% }|skills/digest/.env")
fi

[ -n "$SLACK_WEBHOOK_URL" ] && SLACK_ENABLED=true

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
  read -p "  기존 디렉토리를 백업하고 심링크로 교체할까요? (y/n): " REPLACE || true
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
cp "$NOTION_SKILL_DIR/claude-commands/hsc:notion-log.md" "$CLAUDE_DIR/commands/hsc:notion-log.md"
echo "  ✅ /hsc:notion-log 커맨드 설치"

# digest 커맨드
cp "$DIGEST_SKILL_DIR/claude-commands/hsc:digest.md" "$CLAUDE_DIR/commands/hsc:digest.md"
echo "  ✅ /hsc:digest 커맨드 설치"

# help 커맨드
HELP_SKILL_DIR="$REPO_DIR/skills/help"
cp "$HELP_SKILL_DIR/claude-commands/hsc:help.md" "$CLAUDE_DIR/commands/hsc:help.md"
echo "  ✅ /hsc:help 커맨드 설치"

# setting 커맨드
SETTING_SKILL_DIR="$REPO_DIR/skills/setting"
cp "$SETTING_SKILL_DIR/claude-commands/hsc:setting.md" "$CLAUDE_DIR/commands/hsc:setting.md"
echo "  ✅ /hsc:setting 커맨드 설치"

# setup-review 커맨드
SETUP_REVIEW_SKILL_DIR="$REPO_DIR/skills/setup-review"
cp "$SETUP_REVIEW_SKILL_DIR/claude-commands/hsc:setup-review.md" "$CLAUDE_DIR/commands/hsc:setup-review.md"
echo "  ✅ /hsc:setup-review 커맨드 설치"

# design-sample-lab 커맨드
DSL_SKILL_DIR="$REPO_DIR/skills/design-sample-lab"
cp "$DSL_SKILL_DIR/claude-commands/hsc:design-sample-lab.md" "$CLAUDE_DIR/commands/hsc:design-sample-lab.md"
echo "  ✅ /hsc:design-sample-lab 커맨드 설치"

# ============================================================
# 4-b. Agent Skill 설치 (design-sample-lab)
#
# 이 스킬은 슬래시 커맨드가 아니라 Agent Skill이라 ~/.claude/skills/ 아래에
# 있어야 자동으로 인식된다. 복사가 아니라 심링크를 걸어 레포를 단일 출처로
# 유지한다 — 레포에서 고치면 바로 반영된다.
# ============================================================

echo ""
echo "🎨 design-sample-lab Agent Skill 설치..."

mkdir -p "$CLAUDE_DIR/skills"
DSL_LINK="$CLAUDE_DIR/skills/design-sample-lab"

if [ -L "$DSL_LINK" ]; then
  rm "$DSL_LINK"
elif [ -d "$DSL_LINK" ]; then
  mv "$DSL_LINK" "${DSL_LINK}.backup.$(date +%Y%m%d%H%M%S)"
  echo "  📁 기존 디렉토리 백업"
fi

ln -s "$DSL_SKILL_DIR" "$DSL_LINK"
chmod +x "$DSL_SKILL_DIR"/scripts/*.mjs 2>/dev/null || true
echo "  ✅ $DSL_LINK → $DSL_SKILL_DIR"

# 이 스킬은 다른 디자인 스킬들을 호출한다. 무엇이 빠졌는지 지금 알려준다.
# 디자인 스킬이 하나도 없어도 세팅 자체는 실패가 아니므로 || true.
echo ""
node "$DSL_SKILL_DIR/scripts/doctor.mjs" || true

# ============================================================
# 5. Claude Code Hook 설정
# ============================================================

echo ""
echo "🪝 Stop Hook 설정..."

chmod +x "$NOTION_SKILL_DIR/stop-hook.sh"
chmod +x "$NOTION_SKILL_DIR/daily-log.sh"

# Notion 키가 없으면 Hook을 걸지 않는다. 매 세션 종료마다 실패하는
# 리마인더가 뜨는 것보다 아무것도 안 거는 편이 낫다.
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [ "$NOTION_LOG_ENABLED" != true ]; then
  echo "  ⏭️  건너뜀 — Notion 설정이 없어 Stop Hook을 걸지 않습니다"
elif [ -f "$SETTINGS_FILE" ]; then
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

if [ "$NOTION_LOG_ENABLED" != true ]; then
  # 키가 없으면 매일 자정에 실패할 작업을 등록할 이유가 없다.
  # 이전 실행에서 등록해 둔 것이 있으면 정리한다.
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "  🧹 Notion 설정이 없어 기존 자동 실행 등록을 제거했습니다"
  else
    echo "  ⏭️  건너뜀 — Notion 설정이 없어 자동 수집을 등록하지 않습니다"
  fi
else

# 기존 plist 언로드
launchctl unload "$PLIST_PATH" 2>/dev/null || true

mkdir -p "$HOME/Library/LaunchAgents" "$NOTION_SKILL_DIR/logs"

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
        <string>${NOTION_INSTALL_DIR}/daily-log.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>0</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${NOTION_INSTALL_DIR}/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${NOTION_INSTALL_DIR}/logs/launchd-stderr.log</string>
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

fi  # NOTION_LOG_ENABLED

# ============================================================
# 완료
# ============================================================

echo ""
echo "============================================================"
echo "🎉 세팅 완료!"
echo ""
echo "바로 사용 가능:"
echo "  /hsc:design-sample-lab <URL> <요구사항.md>   리디자인 시안 일괄 생성"
echo "  /hsc:help                    스킬 목록"
echo "  /hsc:setting                 설정 확인"
echo "  /hsc:setup-review            Code Review 워크플로우 설정"
[ "$NOTION_LOG_ENABLED" = true ] && echo "  /hsc:notion-log [날짜]        세션을 Notion에 기록"
[ "$DIGEST_ENABLED" = true ]     && echo "  /hsc:digest <주제>           주제별 종합 문서 생성"

# ------------------------------------------------------------
# 키가 없어 비활성된 스킬 안내
# ------------------------------------------------------------

if [ ${#DISABLED_REASONS[@]} -gt 0 ]; then
  echo ""
  echo "⚠️  아래 스킬은 설정값이 없어 사용할 수 없습니다:"
  echo ""
  for entry in "${DISABLED_REASONS[@]}"; do
    CMD="${entry%%|*}"
    REST="${entry#*|}"
    WHY="${REST%%|*}"
    WHERE="${REST##*|}"
    printf "  %-22s %s\n" "$CMD" "$WHY"
    printf "  %-22s → %s 에 채운 뒤 ./setup.sh 다시 실행\n" "" "$WHERE"
  done
  echo ""
  echo "  Notion API Key 발급: https://www.notion.so/my-integrations"
  echo "  (DB ID는 Notion DB URL의 32자리 문자열입니다)"
fi

if [ "$SLACK_ENABLED" != true ]; then
  echo ""
  echo "ℹ️  Slack Webhook이 없어 알림은 전송되지 않습니다 (기록 자체는 정상)."
fi

echo ""
echo "design-sample-lab:"
echo "  요구사항 md 작성법  skills/design-sample-lab/templates/requirements-template.md"
echo "  환경 재점검         node skills/design-sample-lab/scripts/doctor.mjs"

if [ "$NOTION_LOG_ENABLED" = true ]; then
  echo ""
  echo "자동 실행:"
  echo "  매일 00:00 — 어제 세션 자동 수집 → Notion${SLACK_ENABLED:+ + Slack}"
  echo ""
  echo "관리:"
  echo "  launchctl list | grep claude        상태 확인"
  echo "  cat ~/.claude-notion-logger/logs/   로그 확인"
fi
echo "============================================================"
