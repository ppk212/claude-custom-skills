#!/bin/bash
# skill-cleanup 단독 설치. 필요한 것: python3 하나.
#   ./install.sh            스킬 링크 + 세션 시작 알림 hook 등록
#   ./install.sh --no-hook  스킬만 링크
#   ./install.sh --uninstall
set -e

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
LINK="$CLAUDE_DIR/skills/skill-cleanup"
CTL="$SKILL_DIR/scripts/skillctl.py"

command -v python3 >/dev/null || { echo "❌ python3가 필요합니다."; exit 1; }

if [ "$1" = "--uninstall" ]; then
  python3 "$CTL" uninstall-hook
  [ -L "$LINK" ] && rm "$LINK" && echo "  링크 제거: $LINK"
  echo "  보관·백업 파일은 남겨둡니다: $CLAUDE_DIR/skill-cleanup/"
  exit 0
fi

mkdir -p "$CLAUDE_DIR/skills"
if [ -L "$LINK" ]; then
  rm "$LINK"
elif [ -e "$LINK" ]; then
  mv "$LINK" "${LINK}.backup.$(date +%Y%m%d%H%M%S)"
  echo "  📁 기존 디렉토리 백업"
fi
ln -s "$SKILL_DIR" "$LINK"
chmod +x "$CTL"
echo "  ✅ $LINK → $SKILL_DIR"

if [ "$1" != "--no-hook" ]; then
  python3 "$CTL" install-hook
  echo "  ⏰ 알림 주기: 30일 (바꾸기: python3 $CTL config interval_days 60)"
fi
