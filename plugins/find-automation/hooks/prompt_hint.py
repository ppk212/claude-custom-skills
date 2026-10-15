#!/usr/bin/env python3
"""UserPromptSubmit hook: '이번에도/지난번처럼/매번/귀찮' 같은 반복 신호가 보이면
Claude 에게 한 줄 힌트만 준다. 세션당 최대 1회. 신호가 없으면 아무것도 출력하지 않는다.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "skills", "find-automation", "scripts"))
import state  # noqa: E402

REPEAT_RE = re.compile(
    r"(이번에도|지난번(처럼|이랑|과 같|에 했던|거)|저번(처럼|이랑|과 같|에 했던|거)|매번|맨날|늘 하던|항상 하던|"
    r"또 (해|해줘|부탁|돌려|뽑아|정리|만들|확인)|똑같이 (해|다시)|반복(작업|적으로|되는|해서|하기)|귀찮|지겹|"
    r"every ?time|same as (last|before)|like last time|as usual|again,? like|tedious|repetitive)",
    re.I,
)


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    prompt = data.get("prompt") or ""
    sid = data.get("session_id") or ""
    if not prompt or prompt.lstrip().startswith("/") or "find-automation" in prompt:
        return
    m = REPEAT_RE.search(prompt)
    if not m:
        return
    st = state.load()
    if not st["config"]["keyword_hint"]:
        return
    hinted = st.get("hinted_sessions", [])
    if sid in hinted:
        return
    st["hinted_sessions"] = (hinted + [sid])[-50:]
    state.save(st)
    ctx = (f"[find-automation 힌트] 사용자 메시지에 반복 작업 신호('{m.group(0)}')가 있다. "
           "지금 요청을 먼저 평소대로 끝까지 처리하라. 처리 후 이 작업이 실제로 반복되는 일로 보이면 "
           "응답 맨 끝에 한 줄로만 '자주 하는 작업이면 /find-automation 으로 자동화할 수 있어요'라고 제안한다. "
           "반복 작업과 무관하면 이 힌트를 무시한다.")
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": ctx}},
                     ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
