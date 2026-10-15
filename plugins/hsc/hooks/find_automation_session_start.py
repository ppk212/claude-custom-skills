#!/usr/bin/env python3
"""SessionStart hook: 마지막 점검 후 interval_days 가 지났으면 한 줄로 실행을 제안한다.

제안을 띄우는 순간 last_prompted 를 기록하므로, 사용자가 응하지 않아도(거절해도)
다음 주기까지 다시 묻지 않는다. 아무 일도 없을 때는 아무것도 출력하지 않는다(컨텍스트 비용 0).
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "skills", "find-automation", "scripts"))
import state  # noqa: E402

MIN_SESSIONS = 5  # 분석할 기록이 너무 적으면 제안하지 않음


def main():
    try:
        json.load(sys.stdin)
    except ValueError:
        pass
    st = state.load()
    if not st["config"]["session_prompt"] or not state.is_due(st):
        return
    projects = os.path.join(os.path.expanduser(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude"), "projects", "*", "*.jsonl")
    if len(glob.glob(projects)) < MIN_SESSIONS:
        return
    d = state.days_since_last(st)
    interval = st["config"]["interval_days"]
    st["last_prompted"] = state.now().isoformat(timespec="seconds")
    state.save(st)

    since = f"마지막 점검 후 {d}일 지났어요" if d is not None else "아직 한 번도 점검하지 않았어요"
    msg = (f"💡 반복 작업 자동화 점검: {since}. \"자동화할 거 찾아줘\"라고 하거나 /hsc:find-automation 으로 실행 "
           f"(무시하면 {interval}일 뒤 다시 제안 · 끄기: /hsc:find-automation off)")
    ctx = ("[find-automation] 세션 시작 시 사용자에게 다음 한 줄 제안이 표시됨: " + msg + "\n"
           "사용자의 첫 메시지가 이 제안에 대한 수락(예: '응', '그래', '해줘', '찾아줘')이면 find-automation 스킬을 실행한다. "
           "거절하거나 다른 요청이면 이 제안은 무시하고 다시 꺼내지 않는다(이미 다음 주기로 미뤄짐).")
    print(json.dumps({
        "systemMessage": msg,
        "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ctx},
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # 훅 실패로 세션 시작을 방해하지 않는다
