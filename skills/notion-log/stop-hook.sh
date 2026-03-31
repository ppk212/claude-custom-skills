#!/bin/bash
# Claude Code Stop Hook - Notion 로깅 리마인더
# 세션 종료 시 /notion-log 미실행 상태면 block

INPUT=$(cat)

# 무한 루프 방지: 이미 hook이 활성 상태면 그냥 종료
STOP_HOOK_ACTIVE=$(echo "$INPUT" | /usr/bin/python3 -c "import sys,json; print(json.load(sys.stdin).get('stop_hook_active', False))" 2>/dev/null)
if [ "$STOP_HOOK_ACTIVE" = "True" ]; then
  exit 0
fi

# 오늘 날짜로 Notion 로그가 이미 기록되었는지 확인
TODAY=$(date +%Y-%m-%d)
LOG_MARKER="/tmp/notion-log-done-${TODAY}"

if [ -f "$LOG_MARKER" ]; then
  # 이미 로깅됨 → 정상 종료 허용
  exit 0
fi

# 로깅 안 됨 → block하고 /notion-log 실행 요청
cat << EOF
{
  "decision": "block",
  "reason": "Notion에 오늘 세션이 아직 기록되지 않았습니다. /notion-log 를 실행해서 기록해주세요. 기록 없이 종료하려면 다시 종료해주세요."
}
EOF
# 다음번엔 통과하도록 마커 생성 (2번째 시도에서는 종료 가능)
touch "$LOG_MARKER"
exit 0
