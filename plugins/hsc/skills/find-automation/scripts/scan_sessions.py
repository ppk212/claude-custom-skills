#!/usr/bin/env python3
"""find-automation: 로컬 Claude Code 세션 기록에서 반복 패턴을 집계한다.

- 읽기 전용. 결과는 민감정보 마스킹 후 stdout 으로만 출력하고, 파일은 하나도 쓰지 않는다.
- 표준 라이브러리만 사용 (python3.8+).

사용법:
  scan_sessions.py summary [--days 30] [--project 이름] ...   # 반복 패턴 요약
  scan_sessions.py cards [--days 30]                         # 세션별 한 줄 카드 (의미 단위 묶기용)
  scan_sessions.py trace --query 정규식 [--limit 5]           # 특정 요청이 실제로 어떻게 처리됐는지 단계 추적
  scan_sessions.py trace --session <세션ID 앞 8자리>
"""
import argparse
import datetime as dt
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

CONFIG_DIR = os.path.expanduser(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude")
HOME = os.path.expanduser("~")

# ---------------------------------------------------------------- masking

_SECRET_WORDS = (r"(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|"
                 r"private[_-]?key|client[_-]?secret|authorization|credential|cookie|session[_-]?id)")


def _maybe_secret(m):
    s = m.group(0)
    if s.startswith(("/", "~", "-")) or "//" in s or s.count("/") > 2:
        return s  # 경로
    if (re.search(r"[a-z]", s) and re.search(r"[A-Z]", s)
            and len(re.findall(r"\d", s)) >= 3):
        return "<SECRET?>"
    return s


_MASKS = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S), "<PRIVATE_KEY>"),
    (re.compile(r"\b(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_|xox[abprs]-|glpat-|AIza|npm_)[A-Za-z0-9_\-]{10,}"), "<TOKEN>"),
    (re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), "<AWS_KEY>"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+"), "<JWT>"),
    (re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}"), r"\1 <TOKEN>"),
    (re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@"), r"\1<USER>:<PASS>@"),
    # KEY=value, "token": "value", password: value
    (re.compile(r"(?i)([\"']?[A-Za-z0-9_.-]*" + _SECRET_WORDS + r"[A-Za-z0-9_.-]*[\"']?\s*[:=]\s*)"
                r"(\"[^\"]*\"|'[^']*'|[^\s,;&|)]+)"), r"\1<MASKED>"),
    # aws configure set aws_secret_access_key VALUE 처럼 공백으로 값이 오는 경우
    (re.compile(r"(?i)(\b[A-Za-z0-9_.-]*" + _SECRET_WORDS + r"[A-Za-z0-9_.-]*\s+)([A-Za-z0-9/+_=.-]{16,})"), r"\1<MASKED>"),
    (re.compile(r"(?i)(--(?:password|passwd|token|secret|api-key|apikey|access-key|client-secret)(?:\s+|=))(\S+)"), r"\1<MASKED>"),
    (re.compile(r"(?i)(비밀번호|비번|패스워드|암호|토큰|시크릿|api ?키)(\s*(?:는|은|가|이|:|=)\s*)(\S+)"), r"\1\2<MASKED>"),
    (re.compile(r"\b\d{6}-[1-4]\d{6}\b"), "<RRN>"),
    (re.compile(r"\b[0-9a-fA-F]{32,}\b"), "<HEX>"),
    (re.compile(r"(?<![A-Za-z0-9/+_-])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9/+_-])"), _maybe_secret),
    (re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b"), r"\1***@\2"),
]


def mask(text):
    if not text:
        return ""
    for pat, rep in _MASKS:
        text = pat.sub(rep, text)
    return text.replace(HOME, "~")


def snippet(text, n=140):
    t = re.sub(r"\s+", " ", mask(text)).strip()
    return t if len(t) <= n else t[: n - 1] + "…"


# ---------------------------------------------------------------- loading

SKIP_PREFIXES = ("<command-", "<local-command", "<task-notification", "<system-reminder",
                 "[Request interrupted", "<bash-", "Caveat:", "<user-prompt-submit-hook")


def parse_ts(s):
    try:
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def project_label(cwd, dirname):
    if cwd:
        return os.path.basename(cwd.rstrip("/")) or cwd
    return dirname


class Session:
    __slots__ = ("sid", "project", "cwd", "title", "records", "prompts", "steps", "skills", "slash", "start", "entry")

    def __init__(self, sid):
        self.sid = sid
        self.project = None
        self.cwd = None
        self.title = ""
        self.records = []   # timestamps
        self.prompts = []   # (ts, text, idx)
        self.steps = []     # (ts, kind, label, detail)
        self.skills = Counter()
        self.slash = Counter()
        self.start = None
        self.entry = None

    @property
    def short(self):
        return self.sid[:8]


def human_text(r):
    """사람이 직접 입력한 프롬프트면 텍스트를, 아니면 None."""
    if r.get("isMeta") or r.get("isCompactSummary") or r.get("isSidechain"):
        return None
    origin = r.get("origin")
    if isinstance(origin, dict) and origin.get("kind") not in (None, "human"):
        return None
    c = (r.get("message") or {}).get("content")
    if isinstance(c, list):
        if any(isinstance(x, dict) and x.get("type") == "tool_result" for x in c):
            return None
        c = "\n".join(x.get("text", "") for x in c if isinstance(x, dict) and x.get("type") == "text")
    if not isinstance(c, str) or not c.strip():
        return None
    if c.lstrip().startswith(SKIP_PREFIXES):
        return None
    return c


def load_sessions(args):
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.days)
    if args.since:
        since = dt.datetime.fromisoformat(args.since).replace(tzinfo=dt.timezone.utc)
    files = glob.glob(os.path.join(CONFIG_DIR, "projects", "*", "*.jsonl"))
    sessions = {}
    for f in files:
        if os.path.getmtime(f) < since.timestamp():
            continue
        dirname = os.path.basename(os.path.dirname(f))
        s = Session(os.path.basename(f)[:-6])
        try:
            fh = open(f, encoding="utf-8", errors="ignore")
        except OSError:
            continue
        with fh:
            for line in fh:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                t = r.get("type")
                if t == "ai-title":
                    s.title = r.get("aiTitle") or s.title
                    continue
                ts = parse_ts(r["timestamp"]) if r.get("timestamp") else None
                if ts is None:
                    continue
                if ts < since:
                    continue
                s.records.append(ts)
                if s.cwd is None and r.get("cwd"):
                    s.cwd = r["cwd"]
                if s.entry is None and r.get("entrypoint"):
                    s.entry = r["entrypoint"]
                if t == "user":
                    c = (r.get("message") or {}).get("content")
                    if isinstance(c, str):
                        m = re.search(r"<command-name>/?(.*?)</command-name>", c)
                        if m and m.group(1) not in ("clear", "compact", "model", "exit", "resume"):
                            s.slash[m.group(1)] += 1
                    txt = human_text(r)
                    if txt:
                        s.prompts.append((ts, txt, len(s.steps)))
                elif t == "assistant":
                    if r.get("attributionSkill"):
                        s.skills[r["attributionSkill"]] += 0  # 존재 표시만
                    for c in (r.get("message") or {}).get("content") or []:
                        if not (isinstance(c, dict) and c.get("type") == "tool_use"):
                            continue
                        name, inp = c.get("name", ""), c.get("input") or {}
                        if name == "Skill":
                            s.skills[str(inp.get("skill"))] += 1
                        s.steps.append((ts, name, inp))
        if not s.records:
            continue
        if s.entry and s.entry.startswith("sdk") and not args.include_sdk:
            continue
        s.project = project_label(s.cwd, dirname)
        if args.project and not any(p.lower() in (s.cwd or dirname).lower() for p in args.project):
            continue
        if args.exclude_project and any(p.lower() in (s.cwd or dirname).lower() for p in args.exclude_project):
            continue
        s.start = min(s.records)
        s.records.sort()
        sessions[s.sid] = s
    return sessions, since


def load_history_only(args, since, known_sids):
    """세션 원본이 정리돼 없어진 기간의 프롬프트를 history.jsonl 에서 보충."""
    path = os.path.join(CONFIG_DIR, "history.jsonl")
    out = defaultdict(list)
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            sid, disp = r.get("sessionId"), r.get("display") or ""
            if not sid or sid in known_sids or disp.startswith("/"):
                continue
            ts = dt.datetime.fromtimestamp(r.get("timestamp", 0) / 1000, dt.timezone.utc)
            if ts < since:
                continue
            proj = r.get("project") or ""
            if args.project and not any(p.lower() in proj.lower() for p in args.project):
                continue
            if args.exclude_project and any(p.lower() in proj.lower() for p in args.exclude_project):
                continue
            out[sid].append((ts, disp, os.path.basename(proj.rstrip("/"))))
    return out


# ---------------------------------------------------------------- normalizing

def norm_prompt(t):
    t = mask(t)
    t = re.sub(r"\[Pasted text #\d+[^\]]*\]", " PASTE ", t)
    t = re.sub(r"https?://\S+", " URL ", t)
    t = re.sub(r"(?:~|\.{0,2}/)[\w.\-/@가-힣]+", " PATH ", t)
    t = re.sub(r"\d+", "0", t)
    return re.sub(r"\s+", " ", t).strip().lower()[:400]


ACK_RE = re.compile(r"^(응|어|네|예|ㅇㅇ|ㅇㅋ|오케이|ok|okay|yes|좋아|그래|계속|진행|다음|go|continue|해줘|부탁)", re.I)


def is_followup(txt):
    """'계속 진행해줘', '1번으로 해줘' 같은 짧은 승인/선택 응답."""
    t = re.sub(r"\[Image #\d+\]", "", txt).strip()
    return len(t) <= 25 and (ACK_RE.match(t) or re.match(r"^[0-9a-zA-Z]{1,2}(번|안)?(으로|로)?", t) or len(t) <= 6)


def shingles(t, n=3):
    t = t.replace(" ", "_")
    return {t[i:i + n] for i in range(max(1, len(t) - n + 1))}


def cluster(items, key, threshold):
    """items: list of dicts with key -> shingle set. 탐욕적 클러스터링 (역색인으로 후보 축소)."""
    clusters = []   # list of {"reps": [set], "members": [item]}
    index = defaultdict(set)
    for it in items:
        sh = it[key]
        if not sh:
            continue
        cand = Counter()
        for g in sh:
            for ci in index.get(g, ()):
                cand[ci] += 1
        best, best_sim = None, 0.0
        for ci, _ in cand.most_common(30):
            for rep in clusters[ci]["reps"]:
                inter = len(sh & rep)
                sim = inter / (len(sh | rep) or 1)
                if sim > best_sim:
                    best, best_sim = ci, sim
        if best is not None and best_sim >= threshold:
            c = clusters[best]
            c["members"].append(it)
            if len(c["reps"]) < 4:
                c["reps"].append(sh)
                for g in sh:
                    index[g].add(best)
        else:
            clusters.append({"reps": [sh], "members": [it]})
            for g in sh:
                index[g].add(len(clusters) - 1)
    return clusters


TRIVIAL_CMDS = {
    "grep", "rg", "sed", "cat", "ls", "head", "tail", "wc", "find", "awk", "sort", "uniq", "tr", "cut",
    "xargs", "echo", "printf", "true", "false", "test", "[", "mkdir", "rm", "cp", "mv", "chmod", "touch",
    "which", "command", "date", "sleep", "pwd", "cd", "export", "set", "source", ".", "for", "do", "done",
    "if", "then", "fi", "while", "wait", "kill", "type", "file", "stat", "du", "diff", "jq", "tee", "basename",
    "dirname", "realpath", "env", "unset", "local", "read", "case", "esac", "else", "{", "}", "(", ")",
}
TRIVIAL_TOOLS = {"Read", "Grep", "Glob", "ToolSearch", "TodoWrite", "TaskOutput", "BashOutput", "LS"}


def _tok_norm(tok):
    if re.match(r"^['\"]", tok):
        return "<str>"
    if re.match(r"^\d+$", tok):
        return "<n>"
    if "/" in tok or tok.startswith("~"):
        base = os.path.basename(tok.rstrip("/"))
        return base if re.search(r"\.(py|sh|js|ts|mjs|rb)$", base) else "<path>"
    return tok


def bash_segments(cmd):
    cmd = re.sub(r"<<-?\s*'?(\w+)'?.*?\n\1\b", " <heredoc>", cmd, flags=re.S)
    cmd = cmd.split("\n")[0] if cmd.count("\n") > 3 else cmd.replace("\n", " ; ")
    for seg in re.split(r"&&|\|\||;|\|", cmd):
        toks = seg.strip().split()
        while toks and (re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]) or toks[0] in ("timeout", "sudo", "nohup", "time", "exec", "env")):
            toks = toks[1:]
            if toks and re.match(r"^\d+[smh]?$", toks[0]):
                toks = toks[1:]
        if toks:
            yield toks


NOT_COMMANDS = {"import", "from", "print", "break", "continue", "return", "def", "class", "pass", "else:", "try:", "except", "with", "elif", "const", "let", "var", "function"}
READONLY_GIT = {"status", "log", "diff", "show", "branch", "fetch", "rev-parse", "remote", "config", "ls-files", "stash"}


def bash_signature(toks):
    head = os.path.basename(toks[0])
    if head in TRIVIAL_CMDS or head in NOT_COMMANDS or not re.match(r"^[\w.@+-]+$", head):
        return None  # heredoc/여러 줄 스크립트가 잘려 들어온 조각
    if re.match(r"^python[0-9.]*$", head):
        head = "python"
        # Claude 가 즉석에서 쓰는 python - <<EOF / python -c 는 사용자 반복 작업이 아님
        if len(toks) > 1 and toks[1] in ("-", "-c"):
            return None
    if head == "git" and len(toks) > 1 and toks[1] in READONLY_GIT:
        return None
    sig = [head]
    for t in toks[1:]:
        if len(sig) >= 3:
            break
        if t.startswith("-") and head == "python" and t in ("-c", "-m", "-"):
            sig.append(t)
            continue
        if t.startswith("-"):
            continue
        sig.append(_tok_norm(t))
    return " ".join(sig)


def step_label(name, inp):
    if name == "Bash":
        for toks in bash_segments(inp.get("command") or ""):
            sig = bash_signature(toks)
            if sig:
                return "$ " + sig
        return None
    if name in TRIVIAL_TOOLS:
        return None
    if name.startswith("mcp__"):
        parts = name.split("__")
        server = re.sub(r"^(claude_ai_|plugin_)", "", parts[1]) if len(parts) > 2 else ""
        return f"{server}:{parts[-1]}"
    if name == "Skill":
        return f"Skill({inp.get('skill')})"
    if name in ("Write", "Edit"):
        p = inp.get("file_path") or ""
        ext = os.path.splitext(p)[1] or os.path.basename(p)
        return f"{name}(*{ext})"
    return name


# ---------------------------------------------------------------- analysis

def active_minutes(records, start, end, idle_cap=600):
    """start~end 사이 활동 시간(분). 10분 넘는 공백은 자리 비움으로 보고 제외."""
    total, prev = 0.0, None
    for ts in records:
        if ts < start:
            continue
        if ts > end:
            break
        if prev is not None:
            gap = (ts - prev).total_seconds()
            if gap <= idle_cap:
                total += gap
        prev = ts
    return total / 60


def ref(s, ts=None):
    d = (ts or s.start).astimezone().strftime("%m-%d")
    title = f" \"{snippet(s.title, 40)}\"" if s.title else ""
    return f"{s.short}({d},{s.project}){title}"


def summarize(args):
    sessions, since = load_sessions(args)
    history = load_history_only(args, since, set(sessions))
    out = []
    p = out.append
    n_prompts = sum(len(s.prompts) for s in sessions.values())
    p(f"# 세션 분석 요약 (since {since.astimezone().date()}, 마스킹 적용)")
    p(f"- 세션 {len(sessions)}개, 사람 프롬프트 {n_prompts}개, 프로젝트 {len({s.project for s in sessions.values()})}개"
      + (f"; 원본이 정리된 세션 {len(history)}개는 history.jsonl 프롬프트만 사용" if history else ""))
    by_proj = Counter(s.project for s in sessions.values())
    p("- 프로젝트별 세션 수: " + ", ".join(f"{k} {v}" for k, v in by_proj.most_common(12)))

    # ---- 1. 비슷한 요청(프롬프트) 클러스터
    items, followups = [], []
    for s in sessions.values():
        for i, (ts, txt, step_idx) in enumerate(s.prompts):
            if "find-automation" in txt:
                continue
            nxt = s.prompts[i + 1][0] if i + 1 < len(s.prompts) else s.records[-1]
            it = {"sh": shingles(norm_prompt(txt)), "txt": txt, "ts": ts, "s": s,
                  "min": active_minutes(s.records, ts, nxt), "first": i == 0}
            if is_followup(txt):
                followups.append(it)
            else:
                items.append(it)
    for sid, rows in history.items():
        for ts, disp, proj in rows:
            fake = Session(sid)
            fake.project, fake.start, fake.title = proj, ts, ""
            items.append({"sh": shingles(norm_prompt(disp)), "txt": disp, "ts": ts, "s": fake, "min": None, "first": False})
    items.sort(key=lambda x: x["ts"])
    clusters = cluster(items, "sh", args.threshold)
    rows = []
    for c in clusters:
        m = c["members"]
        sids = {x["s"].sid for x in m}
        if len(m) < args.min_count or len(sids) < 2:
            continue
        mins = [x["min"] for x in m if x["min"] is not None]
        rows.append((len(sids), len(m), m, mins))
    rows.sort(key=lambda r: (r[0], r[1]), reverse=True)
    p("\n## 1. 반복되는 요청 (비슷한 프롬프트 묶음)")
    p("형식: [P#] 횟수/세션수, 기간, 회당 추정 소요(분, 중앙값), 프로젝트 → 예시와 근거 세션")
    for k, (ns, nm, m, mins) in enumerate(rows[: args.top], 1):
        mins.sort()
        med = f"{mins[len(mins) // 2]:.0f}분" if mins else "?"
        projs = Counter(x["s"].project for x in m)
        dates = sorted(x["ts"] for x in m)
        p(f"\n[P{k}] {nm}회/{ns}세션, {dates[0].astimezone():%m-%d}~{dates[-1].astimezone():%m-%d}, 회당 ~{med}, "
          + ", ".join(f"{a}×{b}" for a, b in projs.most_common(3)))
        seen = set()
        for x in m:
            sn = snippet(x["txt"], 150)
            if sn in seen:
                continue
            seen.add(sn)
            p(f"  - \"{sn}\"")
            if len(seen) >= args.examples:
                break
        refs = []
        for x in m:
            r = ref(x["s"], x["ts"])
            if r not in refs:
                refs.append(r)
        p("  - 근거: " + "; ".join(refs[:6]) + (" …" if len(refs) > 6 else ""))

    # ---- 1-b. 세션 주제(ai-title) 묶음
    titled = []
    for s in sessions.values():
        if s.title:
            words = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9.+-]+|[가-힣]{2,}", s.title)}
            titled.append({"sh": words, "s": s})
    tcl = [c for c in cluster(titled, "sh", 0.34) if len(c["members"]) >= 2]
    tcl.sort(key=lambda c: len(c["members"]), reverse=True)
    p("\n## 1-b. 비슷한 주제의 세션 (ai-title 묶음, 2개 이상)")
    for k, c in enumerate(tcl[: args.top], 1):
        m = c["members"]
        mins = sum(active_minutes(x["s"].records, x["s"].records[0], x["s"].records[-1]) for x in m)
        p(f"[T{k}] {len(m)}세션, 합계 ~{mins:.0f}분 — " + "; ".join(ref(x["s"]) for x in m[:5]))

    # ---- 1-c. 반복되는 짧은 응답 (Claude 가 멈추거나 되묻는 지점)
    fc = Counter(re.sub(r"[\s.!~]+$", "", re.sub(r"\[Image #\d+\]", "", x["txt"]).strip()) for x in followups)
    fs = defaultdict(set)
    for x in followups:
        fs[re.sub(r"[\s.!~]+$", "", re.sub(r"\[Image #\d+\]", "", x["txt"]).strip())].add(x["s"].sid)
    p("\n## 1-c. 반복되는 짧은 승인/선택 응답 (Claude 가 멈추거나 되묻는 지점 — 권한·CLAUDE.md 규칙 후보)")
    p(f"- 전체 {len(followups)}회: " + ", ".join(f"\"{snippet(a, 30)}\" {b}회/{len(fs[a])}세션" for a, b in fc.most_common(10) if a))

    # ---- 2. 반복 실행 명령어
    sig_sessions, sig_count, sig_examples = defaultdict(set), Counter(), defaultdict(list)
    full_sessions, full_examples = defaultdict(set), {}
    for s in sessions.values():
        for ts, name, inp in s.steps:
            if name != "Bash":
                continue
            cmd = inp.get("command") or ""
            norm_full = []
            for toks in bash_segments(cmd):
                sig = bash_signature(toks)
                if not sig:
                    continue
                sig_sessions[sig].add(s.sid)
                sig_count[sig] += 1
                if len(sig_examples[sig]) < 3:
                    sn = snippet(" ".join(toks), 160)
                    if sn not in sig_examples[sig]:
                        sig_examples[sig].append(sn)
                norm_full.append(" ".join(_tok_norm(t) for t in toks))
            if len(norm_full) >= 2 and not re.search(r"python[0-9.]*\s+-\s*<<", cmd):
                key = " && ".join(norm_full)[:300]
                full_sessions[key].add(s.sid)
                full_examples.setdefault(key, snippet(key, 160) + "  ← 예: " + snippet(cmd, 120))
    p("\n## 2. 자주 실행하는 명령어 (세션 3개 이상)")
    p("형식: [C#] 시그니처 — 실행 횟수/세션수 → 실제 예시(마스킹)")
    sigs = [x for x in sig_sessions if len(sig_sessions[x]) >= 3]
    sigs.sort(key=lambda x: (len(sig_sessions[x]), sig_count[x]), reverse=True)
    for k, sig in enumerate(sigs[: args.top], 1):
        ss = [sessions[i] for i in sig_sessions[sig]]
        projs = Counter(x.project for x in ss)
        p(f"[C{k}] `{sig}` — {sig_count[sig]}회/{len(ss)}세션 ({', '.join(f'{a}×{b}' for a, b in projs.most_common(3))})")
        for e in sig_examples[sig][:2]:
            p(f"  - `{e}`")
    combos = [k for k, v in full_sessions.items() if len(v) >= 3]
    combos.sort(key=lambda k: len(full_sessions[k]), reverse=True)
    if combos:
        p("\n### 2-b. 여러 세션에서 거의 그대로 반복된 복합 명령")
        for k, key in enumerate(combos[:10], 1):
            p(f"[CC{k}] {len(full_sessions[key])}세션 — `{full_examples[key]}`")

    # ---- 3. 반복되는 작업 흐름 (도구 호출 순서)
    gram_sessions, gram_examples = defaultdict(set), {}
    for s in sessions.values():
        labels = []
        for ts, name, inp in s.steps:
            lb = step_label(name, inp)
            if lb and (not labels or labels[-1] != lb):
                labels.append(lb)
        for n in (2, 3, 4):
            for i in range(len(labels) - n + 1):
                g = tuple(labels[i:i + n])
                if len(set(g)) < n:
                    continue
                gram_sessions[g].add(s.sid)
    grams = [g for g, v in gram_sessions.items() if len(v) >= 3]
    # 더 긴 시퀀스에 같은 세션수로 포함되는 짧은 시퀀스는 제거
    grams.sort(key=lambda g: (len(gram_sessions[g]), len(g)), reverse=True)
    kept = []
    for g in grams:
        if any(len(h) > len(g) and len(gram_sessions[h]) >= len(gram_sessions[g])
               and any(h[i:i + len(g)] == g for i in range(len(h) - len(g) + 1)) for h in grams):
            continue
        kept.append(g)
    p("\n## 3. 반복되는 작업 흐름 (도구/명령 순서, 세션 3개 이상)")
    for k, g in enumerate(kept[: args.top], 1):
        ss = [sessions[i] for i in gram_sessions[g]]
        p(f"[F{k}] {' → '.join(g)} — {len(ss)}세션; 예: " + "; ".join(ref(x) for x in ss[:3]))

    # ---- 4. 반복되는 지적/정정 (CLAUDE.md 규칙·hook 후보)
    corr = []
    for it in items:
        t = it["txt"].strip()
        if it["first"] or len(t) > 400:
            continue
        if re.match(r"^(아니|아냐|그게 아니|그거 말고|말고|다시|왜 |틀렸|잘못|no[ ,.]|nope|don'?t|stop|wrong)", t, re.I) \
                or re.search(r"(하지 ?마|하지 말|말라고|라고 했잖|했는데 왜|또 틀|안 ?된다고)", t):
            corr.append(it)
    cc = [c for c in cluster(corr, "sh", 0.2) if len({x["s"].sid for x in c["members"]}) >= 2]
    cc.sort(key=lambda c: len(c["members"]), reverse=True)
    p("\n## 4. 반복되는 정정/지적 (규칙화 후보)")
    if not cc:
        p("- (2개 이상 세션에서 반복된 정정 없음)")
    for k, c in enumerate(cc[:8], 1):
        m = c["members"]
        p(f"[R{k}] {len(m)}회 — " + " / ".join(f"\"{snippet(x['txt'], 90)}\"" for x in m[:3])
          + " — 근거: " + "; ".join(ref(x["s"], x["ts"]) for x in m[:3]))

    # ---- 5. 이미 자동화된 것
    sk, sl = Counter(), Counter()
    for s in sessions.values():
        for k2, v in s.skills.items():
            sk[k2] += max(v, 1)
        sl.update(s.slash)
    p("\n## 5. 이미 쓰고 있는 스킬/커맨드 (후보에서 중복 제외용)")
    p("- 스킬: " + (", ".join(f"{a} {b}" for a, b in sk.most_common(15)) or "없음"))
    p("- 슬래시 커맨드: " + (", ".join(f"/{a} {b}" for a, b in sl.most_common(15)) or "없음"))
    installed = sorted({os.path.basename(os.path.dirname(x)) for x in glob.glob(os.path.join(CONFIG_DIR, "skills", "*", "SKILL.md"))}
                       | {os.path.basename(x)[:-3] for x in glob.glob(os.path.join(CONFIG_DIR, "commands", "*.md"))})
    if installed:
        p(f"- 사용자 스킬/커맨드 설치됨 {len(installed)}개: " + ", ".join(installed[:40]) + (" …" if len(installed) > 40 else ""))
    print("\n".join(out))


CARD_TAGS = [
    ("첨부문서", lambda s, txt, tools: re.search(r"@~?/\S+\.(md|pdf|xlsx?|csv|docx?|txt|json)", txt)),
    ("이미지", lambda s, txt, tools: "[Image #" in txt),
    ("타인발 요청?", lambda s, txt, tools: re.search(r"(왔거든|왔어|온거|보내줬|요청이|문의|물어봐|대\.|뜬대|라고 하|메일이 왔|알림이 왔|멤버|팀원|동료|사람들)", txt)),
    ("공지·가이드", lambda s, txt, tools: re.search(r"(공지|가이드|안내문|매뉴얼)", txt)),
    ("Confluence작성", lambda s, txt, tools: tools.get("create/updateConfluence")),
    ("Docs작성", lambda s, txt, tools: tools.get("Claude_Docs")),
    ("웹조사", lambda s, txt, tools: tools.get("WebSearch", 0) + tools.get("WebFetch", 0) >= 2),
    ("AWS", lambda s, txt, tools: tools.get("$aws")),
    ("PR", lambda s, txt, tools: tools.get("$gh pr create")),
    ("브라우저", lambda s, txt, tools: tools.get("playwright")),
    ("서브에이전트", lambda s, txt, tools: tools.get("Agent", 0) >= 2),
]


def cards(args):
    """세션별 한 줄 카드. 표현이 매번 달라 글자 유사도로 안 묶이는 반복(같은 주제, 같은 업무 유형)을
    Claude 가 의미 단위로 묶을 수 있게 재료를 준다."""
    sessions, since = load_sessions(args)
    rows = [s for s in sessions.values() if s.prompts]
    rows.sort(key=lambda s: s.start)
    print(f"# 세션 카드 {len(rows)}개 (since {since.astimezone().date()}, 마스킹 적용)")
    print("형식: 세션ID 날짜 프로젝트 활동분 프롬프트수 | 제목 | 첫 요청 | 태그")
    for s in rows[-args.limit:]:
        tools = Counter()
        for _, name, inp in s.steps:
            if name.startswith("mcp__"):
                if "ConfluencePage" in name and ("create" in name or "update" in name):
                    tools["create/updateConfluence"] += 1
                if "playwright" in name:
                    tools["playwright"] += 1
                tools[name.split("__")[1].replace("claude_ai_", "")] += 1
            elif name == "Bash":
                c = inp.get("command") or ""
                if re.search(r"(^|[;&|\s])aws\s", c):
                    tools["$aws"] += 1
                if "gh pr create" in c:
                    tools["$gh pr create"] += 1
            else:
                tools[name] += 1
        alltxt = "\n".join(t for _, t, _ in s.prompts)
        tags = [name for name, f in CARD_TAGS if f(s, alltxt, tools)]
        mins = active_minutes(s.records, s.records[0], s.records[-1])
        print(f"{s.short} {s.start.astimezone():%m-%d} {s.project} {mins:.0f}분 p{len(s.prompts)} | "
              f"{snippet(s.title, 40) or '-'} | {snippet(s.prompts[0][1], args.chars)} | {','.join(tags)}")


def trace(args):
    sessions, since = load_sessions(args)
    pat = re.compile(args.query, re.I) if args.query else None
    shown = 0
    for s in sorted(sessions.values(), key=lambda s: s.start, reverse=True):
        if args.session and not s.sid.startswith(args.session):
            continue
        for i, (ts, txt, step_idx) in enumerate(s.prompts):
            if pat and not pat.search(txt):
                continue
            end_idx = s.prompts[i + 1][2] if i + 1 < len(s.prompts) else len(s.steps)
            nxt = s.prompts[i + 1][0] if i + 1 < len(s.prompts) else s.records[-1]
            print(f"\n### {ref(s, ts)} — 이후 ~{active_minutes(s.records, ts, nxt):.0f}분")
            print(f"> {snippet(txt, args.chars)}")
            for _, name, inp in s.steps[step_idx:end_idx][: args.max_steps]:
                if name == "Bash":
                    d = snippet(inp.get("command") or "", 200)
                elif name in ("Write", "Edit", "Read"):
                    d = mask(inp.get("file_path") or "")
                elif name == "Skill":
                    d = str(inp.get("skill"))
                elif name in ("Agent", "Task"):
                    d = snippet(inp.get("description") or "", 80)
                elif name.startswith("mcp__"):
                    d = snippet(json.dumps(inp, ensure_ascii=False), 120)
                else:
                    d = ""
                print(f"  - {name}: {d}")
            if end_idx - step_idx > args.max_steps:
                print(f"  - … (+{end_idx - step_idx - args.max_steps} steps)")
            shown += 1
            if shown >= args.limit:
                return
            if not args.session:
                break  # 세션당 하나만 (다양한 세션 보기)
    if shown == 0:
        print("(일치하는 프롬프트 없음)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    for name in ("summary", "cards", "trace"):
        sp = sub.add_parser(name)
        sp.add_argument("--days", type=int, default=30, help="최근 N일 (기본 30)")
        sp.add_argument("--since", help="YYYY-MM-DD (지정 시 --days 무시)")
        sp.add_argument("--project", action="append", help="cwd 에 이 문자열이 포함된 프로젝트만 (여러 번 가능)")
        sp.add_argument("--exclude-project", action="append")
        sp.add_argument("--include-sdk", action="store_true", help="claude -p / SDK 세션도 포함")
    s1 = sub.choices["summary"]
    s1.add_argument("--top", type=int, default=15)
    s1.add_argument("--examples", type=int, default=3)
    s1.add_argument("--min-count", type=int, default=3)
    s1.add_argument("--threshold", type=float, default=0.3, help="프롬프트 유사도 기준 (0~1)")
    s3 = sub.choices["cards"]
    s3.add_argument("--limit", type=int, default=200, help="최근 N개 세션만")
    s3.add_argument("--chars", type=int, default=110, help="첫 요청 표시 길이")
    s2 = sub.choices["trace"]
    s2.add_argument("--query", help="프롬프트 정규식")
    s2.add_argument("--session", help="세션ID 접두사")
    s2.add_argument("--limit", type=int, default=5)
    s2.add_argument("--max-steps", type=int, default=25)
    s2.add_argument("--chars", type=int, default=300)
    argv = sys.argv[1:]
    if not argv or argv[0].startswith("-") and argv[0] not in ("-h", "--help"):
        argv = ["summary"] + argv
    args = ap.parse_args(argv)
    if args.cmd == "trace" and not (args.query or args.session):
        ap.error("trace 에는 --query 또는 --session 이 필요합니다")
    {"summary": summarize, "cards": cards, "trace": trace}[args.cmd](args)


if __name__ == "__main__":
    main()
