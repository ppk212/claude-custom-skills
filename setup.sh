#!/bin/bash
# ============================================================
# Claude Custom Skills — 플러그인 일괄 설치
#
#   ./setup.sh             마켓플레이스(GitHub) 등록 + hsc 플러그인 설치 + 예전 방식 설치 정리
#   ./setup.sh --yes       정리할 항목을 묻지 않고 진행 (Claude Code의 ! 처럼 입력을 받을 수 없을 때)
#   ./setup.sh --local     GitHub 대신 이 clone 폴더를 마켓플레이스로 등록 (레포 수정 테스트용)
#   ./setup.sh --uninstall hsc 플러그인 제거
#
# Claude Code 안에서 직접 해도 된다:
#   /plugin marketplace add ppk212/claude-custom-skills
#   /plugin install hsc@hsc
# ============================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
MARKET="hsc"
SOURCE="ppk212/claude-custom-skills"
PLUGINS="hsc"
# 예전에 따로 배포하던 플러그인. 지금은 모두 hsc 안에 들어 있다
OLD_PLUGINS="skill-cleanup design-sample-lab find-automation"
YES=false
MODE="install"

for a in "$@"; do
  case "$a" in
    --local) SOURCE="$REPO_DIR" ;;
    --uninstall) MODE="uninstall" ;;
    -y|--yes) YES=true ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "알 수 없는 옵션: $a"; exit 2 ;;
  esac
done

command -v claude >/dev/null || { echo "❌ claude CLI가 필요합니다: https://docs.claude.com/claude-code"; exit 1; }

if [ "$MODE" = uninstall ]; then
  for p in $PLUGINS $OLD_PLUGINS; do
    if claude plugin uninstall "$p@$MARKET" >/dev/null 2>&1; then echo "  🗑  $p"; fi
  done
  exit 0
fi

echo "🚀 Claude Custom Skills 플러그인 설치"
echo ""

# ------------------------------------------------------------
# 1. 예전 방식(setup.sh 복사·심링크·settings.json hook) 설치 정리
#    그대로 두면 같은 커맨드·스킬이 두 번 뜨고, 옮겨진 경로를 가리키는 hook이 실패한다.
# ------------------------------------------------------------

LEGACY=()
for n in notion-log digest help setting setup-review design-sample-lab; do
  [ -f "$CLAUDE_DIR/commands/hsc:$n.md" ] && LEGACY+=("cmd|$CLAUDE_DIR/commands/hsc:$n.md")
done
for n in design-sample-lab skill-cleanup; do
  L="$CLAUDE_DIR/skills/$n"
  if [ -L "$L" ]; then
    case "$(readlink "$L")" in *claude-custom-skills*) LEGACY+=("link|$L") ;; esac
  fi
done
for n in notion-logger digest; do
  L="$HOME/.claude-$n"
  [ -L "$L" ] && LEGACY+=("home|$L")
done
INSTALLED=$(claude plugin list 2>/dev/null || true)
for p in $OLD_PLUGINS; do
  echo "$INSTALLED" | grep -q "$p@$MARKET" && LEGACY+=("plugin|$p@$MARKET")
done
if [ -f "$CLAUDE_DIR/settings.json" ] && grep -qE 'skill-cleanup/scripts/skillctl.py|claude-notion-logger/stop-hook.sh' "$CLAUDE_DIR/settings.json"; then
  LEGACY+=("hook|$CLAUDE_DIR/settings.json")
fi

if [ ${#LEGACY[@]} -gt 0 ]; then
  echo "🧹 예전 방식으로 설치된 항목이 있습니다. 플러그인과 겹치므로 정리합니다:"
  for e in "${LEGACY[@]}"; do
    case "${e%%|*}" in
      cmd)  echo "  - 커맨드 복사본 삭제     ${e#*|}" ;;
      link) echo "  - 스킬 심링크 삭제       ${e#*|}" ;;
      home) echo "  - 심링크를 설정 폴더로   ${e#*|}  (.env는 그대로 옮김, hsc가 계속 읽음)" ;;
      hook) echo "  - settings.json에서 이 레포의 SessionStart/Stop hook 제거 (백업 생성)" ;;
      plugin) echo "  - 개별 플러그인 제거     ${e#*|}  (hsc에 포함됨)" ;;
    esac
  done
  if [ "$YES" = true ]; then
    OK=y
  elif [ -t 0 ]; then
    read -p "  진행할까요? (y/n): " OK || true
  else
    OK=n
    echo "  ℹ️  입력을 받을 수 없는 환경입니다. 정리하려면 ./setup.sh --yes 로 다시 실행하세요."
  fi
  if [ "$OK" = y ]; then
    for e in "${LEGACY[@]}"; do
      t="${e#*|}"
      case "${e%%|*}" in
        cmd|link) rm "$t" ;;
        plugin) claude plugin uninstall "$t" >/dev/null 2>&1 || echo "  ⚠️  $t 제거 실패 — /plugin 에서 직접 제거하세요" ;;
        home)
          src="$(readlink "$t")"; rm "$t"; mkdir -p "$t/logs"
          if [ -f "$src/.env" ]; then cp "$src/.env" "$t/.env"; chmod 600 "$t/.env"; fi
          ;;
        hook)
          cp "$t" "$t.backup.$(date +%Y%m%d%H%M%S)"
          python3 - "$t" <<'PY'
import json, sys
p = sys.argv[1]
s = json.load(open(p))
pat = ("skill-cleanup/scripts/skillctl.py", "claude-notion-logger/stop-hook.sh")
hooks = s.get("hooks", {})
for ev in list(hooks):
    kept = []
    for g in hooks[ev]:
        g["hooks"] = [h for h in g.get("hooks", []) if not any(x in h.get("command", "") for x in pat)]
        if g["hooks"]:
            kept.append(g)
    if kept:
        hooks[ev] = kept
    else:
        hooks.pop(ev)
if not hooks:
    s.pop("hooks", None)
json.dump(s, open(p, "w"), ensure_ascii=False, indent=2)
open(p, "a").write("\n")
PY
          ;;
      esac
    done
    echo "  ✅ 정리 완료"
  else
    echo "  ⏭️  건너뜀 — 같은 스킬이 두 번 보일 수 있습니다"
  fi
  echo ""
fi

# 예전 setup.sh가 등록한 launchd 작업은 옮겨진 스크립트를 가리켜 매일 실패한다. 해제하고 새 방식을 안내한다.
OLD_PLIST="$HOME/Library/LaunchAgents/com.claude.notion-logger.plist"
OLD_SCHEDULE=false
if [ -f "$OLD_PLIST" ]; then
  launchctl unload "$OLD_PLIST" 2>/dev/null || true
  rm -f "$OLD_PLIST"
  OLD_SCHEDULE=true
fi

# ------------------------------------------------------------
# 2. 마켓플레이스 등록 + 플러그인 설치
# ------------------------------------------------------------

echo "📦 마켓플레이스 등록: $SOURCE"
if claude plugin marketplace list 2>/dev/null | grep -qE "(^|[^a-z-])$MARKET\$"; then
  claude plugin marketplace update "$MARKET" >/dev/null 2>&1 || true
  echo "  (이미 등록됨 → 최신으로 업데이트)"
else
  claude plugin marketplace add "$SOURCE"
fi
echo ""

for p in $PLUGINS; do
  # install은 이미 설치된 플러그인을 새 버전으로 올리지 않으므로 설치돼 있으면 update
  if claude plugin list 2>/dev/null | grep -q "$p@$MARKET"; then
    claude plugin update "$p@$MARKET" >/dev/null 2>&1 || true
    echo "  ✅ $p $(claude plugin list 2>/dev/null | grep -A1 "$p@$MARKET" | sed -n 's/.*Version: //p')"
  elif claude plugin install "$p@$MARKET" -s user >/dev/null 2>&1; then
    echo "  ✅ $p"
  else
    echo "  ⚠️  $p 설치 실패 — Claude Code에서 /plugin install $p@$MARKET 로 다시 시도하세요"
  fi
done

if [ "$OLD_SCHEDULE" = true ]; then
  echo ""
  echo "⏰ 예전 자동 수집(launchd) 등록을 해제했습니다. 계속 쓰려면 Claude Code에서"
  echo "   /plugin → Installed → hsc → Configure options → '매일 자동 기록'을 켜세요."
fi

# ------------------------------------------------------------
# 3. 안내
# ------------------------------------------------------------

cat <<EOF

============================================================
🎉 설치 완료 — Claude Code를 재시작하면 적용됩니다.

  /hsc:help                       전체 안내
  Notion 설정 (notion-log, digest)  /plugin → Installed → hsc → Configure options
  /hsc:setup-review               GitHub Code Review 워크플로우 설정
  /hsc:find-automation            반복 작업 찾아 자동화
  /hsc:skill-cleanup              안 쓰는·겹치는 스킬 정리
  /hsc:design-sample-lab <URL> <md>  리디자인 시안 일괄 생성

업데이트:   claude plugin marketplace update $MARKET && claude plugin update hsc@$MARKET
============================================================
EOF
