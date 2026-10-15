#!/usr/bin/env python3
"""find-automation 실행 기록·설정 관리. (세션 내용은 저장하지 않고 날짜와 설정만 저장)

  state.py status                       현재 설정과 마지막 실행/제안일
  state.py mark-run                     오늘 실행했다고 기록 (스킬 시작 시 호출)
  state.py snooze                       이번 주기 제안 건너뛰기
  state.py config interval_days 7       세션 시작 제안 주기 (기본 14일)
  state.py config session_prompt off    세션 시작 제안 끄기/켜기 (on|off)
  state.py config keyword_hint off      '또/매번/지난번처럼' 키워드 힌트 끄기/켜기 (on|off)

저장 위치: ${CLAUDE_CONFIG_DIR:-~/.claude}/find-automation/state.json (FIND_AUTOMATION_STATE_DIR 로 변경 가능)
"""
import datetime as dt
import json
import os
import sys

STATE_DIR = os.environ.get("FIND_AUTOMATION_STATE_DIR") or os.path.join(os.path.expanduser(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude"), "find-automation")
STATE_FILE = os.path.join(STATE_DIR, "state.json")
DEFAULTS = {"interval_days": 14, "session_prompt": True, "keyword_hint": True}


def load():
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            st = json.load(f)
    except (OSError, ValueError):
        st = {}
    st.setdefault("config", {})
    for k, v in DEFAULTS.items():
        st["config"].setdefault(k, v)
    return st


def save(st):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_FILE)


def now():
    return dt.datetime.now().astimezone()


def parse(s):
    try:
        return dt.datetime.fromisoformat(s)
    except (TypeError, ValueError):
        return None


def days_since_last(st):
    """마지막 실행 또는 마지막 제안 중 최근 것으로부터 지난 일수. 기록이 없으면 None."""
    marks = [parse(st.get("last_run")), parse(st.get("last_prompted"))]
    marks = [m for m in marks if m]
    if not marks:
        return None
    return (now() - max(marks)).days


def is_due(st):
    d = days_since_last(st)
    return d is None or d >= int(st["config"]["interval_days"])


def _bool(v):
    return str(v).lower() in ("1", "true", "on", "yes", "y", "켜기", "켬")


def main(argv):
    st = load()
    cmd = argv[0] if argv else "status"
    if cmd == "mark-run":
        st["last_run"] = now().isoformat(timespec="seconds")
        save(st)
        print(f"기록함: last_run={st['last_run']}")
    elif cmd == "snooze":
        st["last_prompted"] = now().isoformat(timespec="seconds")
        save(st)
        print(f"{st['config']['interval_days']}일 동안 세션 시작 제안을 하지 않습니다.")
    elif cmd == "config":
        if len(argv) == 1:
            print(json.dumps(st["config"], ensure_ascii=False, indent=2))
            return
        key = argv[1]
        if key not in DEFAULTS:
            sys.exit(f"알 수 없는 설정: {key} (가능: {', '.join(DEFAULTS)})")
        if len(argv) < 3:
            print(st["config"][key])
            return
        val = argv[2]
        if key == "interval_days":
            val = int(val)
            if val < 1:
                sys.exit("interval_days 는 1 이상이어야 합니다")
        else:
            val = _bool(val)
        st["config"][key] = val
        save(st)
        print(f"{key} = {val}")
    elif cmd == "status":
        d = days_since_last(st)
        print(json.dumps({
            "config": st["config"],
            "last_run": st.get("last_run"),
            "last_prompted": st.get("last_prompted"),
            "days_since": d,
            "due": is_due(st),
            "state_file": STATE_FILE,
        }, ensure_ascii=False, indent=2))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
