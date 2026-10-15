#!/usr/bin/env python3
"""skill-cleanup helper. Standard library only (Python 3.9+).

Everything here runs locally. Transcript contents are never printed or sent
anywhere — only aggregate counts and dates leave this script.

Subcommands
  inventory            list every installed skill/command (JSON)
  usage                inventory + usage stats from local transcripts (JSON)
  table                usage as a readable markdown table
  similar              candidate duplicate pairs (JSON)
  listing              skill-listing size: measured from transcripts + estimated now
  snapshot NAME        save inventory/listing size to the state dir (for before/after)
  compare A B          diff two snapshots (markdown)
  archive ID...        move personal/project skills to the archive (restorable)
  restore ID...        move archived skills back
  backup ID...         copy a skill to the backup dir before editing it
  override ID MODE     set skillOverrides (on|name-only|user-invocable-only|off)
  log ACTION ID NOTE   append to the change journal
  mark-run             record that a cleanup ran (resets the reminder clock)
  config [KEY VALUE]   show / set config (interval_days, enabled)
  hook                 SessionStart hook entry point (prints systemMessage JSON)
  install-hook         (legacy, non-plugin install) register the SessionStart hook in ~/.claude/settings.json
  uninstall-hook       remove it again
"""
import datetime as dt
import glob
import json
import os
import re
import shutil
import sys

HOME = os.path.expanduser("~")
CLAUDE = os.environ.get("CLAUDE_CONFIG_DIR", os.path.join(HOME, ".claude"))
SKILLS = os.path.join(CLAUDE, "skills")
STATE_DIR = os.environ.get("SKILL_CLEANUP_HOME", os.path.join(CLAUDE, "skill-cleanup"))
ARCHIVE = os.path.join(STATE_DIR, "archive")
BACKUPS = os.path.join(STATE_DIR, "backups")
STATE = os.path.join(STATE_DIR, "state.json")
JOURNAL = os.path.join(STATE_DIR, "journal.jsonl")
DEFAULTS = {"interval_days": 30, "enabled": True}
MAX_ENTRY = 1536  # per-skill cap on description + when_to_use in the listing


# ---------------------------------------------------------------- utilities

def now():
    return dt.datetime.now(dt.timezone.utc)


def iso(t):
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def parse_iso(s):
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def state():
    s = load_json(STATE, {})
    for k, v in DEFAULTS.items():
        s.setdefault(k, v)
    if os.environ.get("SKILL_CLEANUP_INTERVAL_DAYS"):
        s["interval_days"] = int(os.environ["SKILL_CLEANUP_INTERVAL_DAYS"])
    return s


def frontmatter(path):
    """Minimal YAML frontmatter reader: top-level scalars, quoted, > and | blocks."""
    try:
        with open(path, errors="ignore") as f:
            text = f.read()
    except OSError:
        return {}, 0
    m = re.match(r"---\s*\n(.*?)\n---", text, re.S)
    if not m:
        return {}, len(text)
    out, key, buf = {}, None, []

    def flush():
        if key is not None:
            v = " ".join(x.strip() for x in buf).strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1].replace("''", "'") if v[0] == "'" else v[1:-1]
            out[key] = v

    for line in m.group(1).splitlines():
        km = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if km:
            flush()
            key, first = km.group(1), km.group(2)
            buf = [] if first in (">", "|", ">-", "|-", ">+", "|+") else [first]
        elif key is not None:
            buf.append(line)
    flush()
    return out, len(text)


# ---------------------------------------------------------------- inventory

def _entry(sid, name, source, path, editable, **extra):
    fm, size = frontmatter(path)
    desc = fm.get("description", "")
    when = fm.get("when_to_use", "")
    listing = min(len(desc) + len(when), MAX_ENTRY) + len(sid) + 4
    e = {
        "id": sid, "name": name, "source": source, "path": path,
        "realpath": os.path.realpath(path), "editable": editable,
        "description": desc, "when_to_use": when,
        "desc_chars": len(desc) + len(when), "listing_chars": listing,
        "file_chars": size,
        "model_invocable": fm.get("disable-model-invocation", "false").lower() != "true",
    }
    e.update(extra)
    return e


def _plugin_dirs(root, key, default):
    manifest = load_json(os.path.join(root, ".claude-plugin", "plugin.json"), {})
    v = manifest.get(key, default)
    vals = v if isinstance(v, list) else [v]
    return [os.path.normpath(os.path.join(root, x)) for x in vals if isinstance(x, str)]


def project_dirs():
    """Directories Claude Code has been run in, taken from transcript cwd fields."""
    seen = set()
    for f in glob.glob(os.path.join(CLAUDE, "projects", "*", "*.jsonl")):
        try:
            with open(f, errors="ignore") as fh:
                for i, line in enumerate(fh):
                    if i > 40:
                        break
                    m = re.search(r'"cwd":"([^"]+)"', line)
                    if m:
                        seen.add(m.group(1))
                        break
        except OSError:
            pass
    seen.add(os.getcwd())
    return sorted(d for d in seen if os.path.isdir(d) and os.path.realpath(d) != os.path.realpath(HOME))


def inventory():
    items = []
    settings = load_json(os.path.join(CLAUDE, "settings.json"), {})
    overrides = settings.get("skillOverrides", {}) or {}

    # personal skills
    for p in sorted(glob.glob(os.path.join(SKILLS, "*", "SKILL.md"))):
        d = os.path.basename(os.path.dirname(p))
        if d.startswith(".") or d == "synced":
            continue
        fm, _ = frontmatter(p)
        name = fm.get("name") or d
        items.append(_entry(name, name, "personal", p, True, dir=os.path.dirname(p),
                            symlink=os.path.islink(os.path.dirname(p)) or os.path.islink(p)))

    # claude.ai-synced skills (managed by claude.ai; read-only here)
    for p in sorted(glob.glob(os.path.join(SKILLS, "synced", "*", "*", "SKILL.md"))):
        d = os.path.basename(os.path.dirname(p))
        items.append(_entry("anthropic-skills:" + d, d, "claude.ai", p, False, dir=os.path.dirname(p)))

    # legacy user commands
    for p in sorted(glob.glob(os.path.join(CLAUDE, "commands", "*.md"))):
        n = os.path.splitext(os.path.basename(p))[0]
        items.append(_entry(n, n, "command", p, True, symlink=os.path.islink(p)))

    # project skills / commands
    for proj in project_dirs():
        for p in sorted(glob.glob(os.path.join(proj, ".claude", "skills", "*", "SKILL.md"))):
            d = os.path.basename(os.path.dirname(p))
            fm, _ = frontmatter(p)
            name = fm.get("name") or d
            items.append(_entry(name, name, "project", p, True, dir=os.path.dirname(p), project=proj))
        for p in sorted(glob.glob(os.path.join(proj, ".claude", "commands", "*.md"))):
            n = os.path.splitext(os.path.basename(p))[0]
            items.append(_entry(n, n, "project-command", p, True, project=proj))

    # plugins
    installed = load_json(os.path.join(CLAUDE, "plugins", "installed_plugins.json"), {}).get("plugins", {})
    enabled = settings.get("enabledPlugins", {}) or {}
    for key, installs in installed.items():
        if not installs:
            continue
        root = installs[0].get("installPath", "")
        pname = key.split("@")[0]
        on = enabled.get(key, False) is not False
        for sd in _plugin_dirs(root, "skills", "./skills"):
            for p in sorted(glob.glob(os.path.join(sd, "*", "SKILL.md"))):
                d = os.path.basename(os.path.dirname(p))
                fm, _ = frontmatter(p)
                n = fm.get("name") or d
                items.append(_entry(pname + ":" + n, n, "plugin", p, False, plugin=key,
                                    plugin_enabled=on, version=installs[0].get("version")))
        for cd in _plugin_dirs(root, "commands", "./commands"):
            for p in sorted(glob.glob(os.path.join(cd, "*.md"))):
                n = os.path.splitext(os.path.basename(p))[0]
                items.append(_entry(pname + ":" + n, n, "plugin-command", p, False, plugin=key,
                                    plugin_enabled=on, version=installs[0].get("version")))

    for e in items:
        e["override"] = overrides.get(e["id"], "on")
        e["active"] = e.get("plugin_enabled", True) and e["override"] != "off"
        if e["override"] in ("name-only", "user-invocable-only"):
            e["listing_chars"] = len(e["id"]) + 4  # only the name stays in the listing
    return items


# ---------------------------------------------------------------- usage

SKILL_READ = re.compile(r"/([\w.:-]+)/SKILL\.md")
CMD = re.compile(r"<command-name>/?([^<\s]+)</command-name>")


def transcripts():
    return glob.glob(os.path.join(CLAUDE, "projects", "**", "*.jsonl"), recursive=True)


def scan_usage():
    """Per-name counters. Keys are the names as they appear in transcripts."""
    stats = {}
    first_seen = None

    def hit(name, kind, ts, session):
        s = stats.setdefault(name, {"invocations": 0, "slash": 0, "file_reads": 0,
                                    "active_messages": 0, "last_used": None, "sessions": set()})
        s[kind] += 1
        if ts and (s["last_used"] is None or ts > s["last_used"]):
            s["last_used"] = ts
        if kind != "active_messages":
            s["sessions"].add(session)

    for f in transcripts():
        try:
            mt = dt.datetime.fromtimestamp(os.path.getmtime(f), dt.timezone.utc)
            fh = open(f, errors="ignore")
        except OSError:
            continue
        with fh:
            for line in fh:
                if not ('"Skill"' in line or "command-name" in line or "SKILL.md" in line
                        or "attributionSkill" in line):
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                ts = d.get("timestamp")
                if ts and (first_seen is None or ts < first_seen):
                    first_seen = ts
                sess = d.get("sessionId") or f
                if d.get("attributionSkill"):
                    hit(d["attributionSkill"], "active_messages", ts, sess)
                c = (d.get("message") or {}).get("content")
                if isinstance(c, list):
                    for b in c:
                        if not isinstance(b, dict) or b.get("type") != "tool_use":
                            continue
                        inp = b.get("input") or {}
                        if b.get("name") == "Skill" and inp.get("skill"):
                            hit(inp["skill"], "invocations", ts, sess)
                        elif b.get("name") in ("Read", "Bash"):
                            for n in SKILL_READ.findall(json.dumps(inp)):
                                hit(n, "file_reads", ts, sess)
                if d.get("type") == "user":
                    text = c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
                    for n in CMD.findall(text or ""):
                        hit(n, "slash", ts, sess)
        del mt

    # history.jsonl keeps typed prompts much longer than transcripts
    hist_first = None
    try:
        with open(os.path.join(CLAUDE, "history.jsonl"), errors="ignore") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                t = d.get("timestamp")
                ts = iso(dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc)) if t else None
                if ts and (hist_first is None or ts < hist_first):
                    hist_first = ts
                m = re.match(r"^/([\w.:-]+)", (d.get("display") or "").strip())
                if m:
                    s = stats.setdefault(m.group(1), {"invocations": 0, "slash": 0, "file_reads": 0,
                                                      "active_messages": 0, "last_used": None,
                                                      "sessions": set()})
                    s["history_slash"] = s.get("history_slash", 0) + 1
                    if ts and (s.get("history_last") is None or ts > s["history_last"]):
                        s["history_last"] = ts
    except OSError:
        pass
    return stats, first_seen, hist_first


def _keys_for(e):
    """Names under which an inventory entry may show up in transcripts."""
    keys = [e["id"]]
    if e["source"] in ("claude.ai",):
        keys.append(e["name"])
    if e["source"] in ("personal", "project", "command", "project-command"):
        keys.append(e["name"])
        d = os.path.basename(e.get("dir", "") or "")
        if d and d not in keys:
            keys.append(d)
    if e["source"] in ("plugin", "plugin-command"):
        keys.append(e["name"])  # bare-name fallback, only if nothing else claims it
    return keys


def usage():
    inv = inventory()
    stats, first, hist_first = scan_usage()
    claimed = set()
    # non-plugin entries claim bare names first so plugins don't steal them
    order = sorted(inv, key=lambda e: e["source"].startswith("plugin"))
    for e in order:
        agg = {"invocations": 0, "slash": 0, "file_reads": 0, "active_messages": 0,
               "history_slash": 0, "last_used": None, "sessions": set()}
        for i, k in enumerate(_keys_for(e)):
            if k not in stats or (k in claimed and i > 0):
                continue
            if e["source"].startswith("plugin") and i > 0 and any(
                    x["name"] == k and not x["source"].startswith("plugin") for x in inv):
                continue
            claimed.add(k)
            s = stats[k]
            for f in ("invocations", "slash", "file_reads", "active_messages"):
                agg[f] += s[f]
            agg["history_slash"] += s.get("history_slash", 0)
            agg["sessions"] |= s["sessions"]
            for t in (s["last_used"], s.get("history_last")):
                if t and (agg["last_used"] is None or t > agg["last_used"]):
                    agg["last_used"] = t
        agg["sessions"] = len(agg["sessions"])
        agg["total_uses"] = agg["invocations"] + agg["slash"] + agg["file_reads"] + agg["history_slash"]
        e["usage"] = agg
    hooked = hook_injected()
    refs = references(inv)
    for e in inv:
        if e["id"] in hooked:
            e["usage"]["hook_injected"] = True
        e["referenced_by"] = refs.get(e["id"], [])
    return {"observed_since": first, "history_since": hist_first,
            "generated_at": iso(now()), "skills": inv}


GENERIC = set("""design docs run init help review setup test plan debug browse code ship
spec health learn guard freeze canary retro scrape diagram onboarding""".split())
TEXT_EXT = (".md", ".json", ".mjs", ".js", ".ts", ".py", ".sh", ".yaml", ".yml", ".txt")


def references(inv):
    """Which other skills mention each skill by name (rosters, 'use X' instructions, scripts).

    Skills that look unused are often called from inside another skill, which
    leaves no trace of their own in transcripts. Symlinks are followed.
    """
    personal_roots = sorted({os.path.dirname(os.path.realpath(e["path"])) for e in inv
                             if e["source"] == "personal"}, key=len)
    me = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

    def package(e):
        if e.get("plugin"):
            return "plugin:" + e["plugin"]
        rp = os.path.dirname(os.path.realpath(e["path"]))
        for root in personal_roots:  # outermost first
            if rp == root or rp.startswith(root + os.sep):
                return root
        return rp

    def distinctive(n):
        return ("-" in n or len(n) >= 9) and n not in GENERIC

    names = {}
    for e in inv:
        for n in {e["id"], e["name"]}:
            if ":" in n or (distinctive(n) and e["source"] != "plugin-command"):
                names.setdefault(n, set()).add(e["id"])
    pat = re.compile(r"(?<![\w/.:-])(" + "|".join(sorted(map(re.escape, names), key=len, reverse=True))
                     + r")(?![\w-])")
    refs = {}
    seen_dirs = set()
    for e in inv:
        root = os.path.realpath(e.get("dir") or e["path"])
        if root in seen_dirs or root == me or root.startswith(me + os.sep):
            continue
        seen_dirs.add(root)
        files = [root] if os.path.isfile(root) else [
            os.path.join(dp, f) for dp, dn, fn in os.walk(root, followlinks=True)
            if "node_modules" not in dp and "/." not in dp[len(root):] for f in fn if f.endswith(TEXT_EXT)]
        found = set()
        for f in files[:400]:
            try:
                if os.path.getsize(f) > 400_000:
                    continue
                with open(f, errors="ignore") as fh:
                    found.update(pat.findall(fh.read()))
            except OSError:
                continue
        src_pkg = package(e)
        for key in found:
            for target in names[key]:
                tgt = next(x for x in inv if x["id"] == target)
                if package(tgt) != src_pkg and tgt["name"] != e["name"]:
                    refs.setdefault(target, set()).add(e["id"])
    return {k: sorted(v) for k, v in refs.items()}


def hook_injected():
    """Plugin skills whose content a SessionStart hook injects (never shows up as a call)."""
    out = set()
    installed = load_json(os.path.join(CLAUDE, "plugins", "installed_plugins.json"), {}).get("plugins", {})
    for key, installs in installed.items():
        if not installs:
            continue
        root = installs[0].get("installPath", "")
        for hf in glob.glob(os.path.join(root, "hooks", "*")):
            try:
                txt = open(hf, errors="ignore").read()
            except OSError:
                continue
            for m in re.findall(r"skills/([\w-]+)/SKILL\.md", txt):
                out.add(key.split("@")[0] + ":" + m)
    return out


def table(data):
    rows = sorted(data["skills"], key=lambda e: (e["usage"]["total_uses"], e["usage"]["last_used"] or ""))
    print(f"관찰 기간: 세션 로그 {(data['observed_since'] or '?')[:10]}~, "
          f"프롬프트 기록 {(data['history_since'] or '?')[:10]}~\n")
    print("| # | 스킬 | 출처 | 사용 | 마지막 사용 | 비고 |")
    print("|---|---|---|---|---|---|")
    for i, e in enumerate(rows, 1):
        u = e["usage"]
        notes = []
        if u.get("hook_injected"):
            notes.append("hook 주입")
        if e.get("referenced_by"):
            r = e["referenced_by"]
            notes.append("참조됨: " + ", ".join(r[:2]) + (f" 외 {len(r) - 2}" if len(r) > 2 else ""))
        if not e["active"]:
            notes.append("비활성")
        if e.get("symlink"):
            notes.append("링크")
        if not e["model_invocable"]:
            notes.append("수동 전용")
        print(f"| {i} | {e['id']} | {e['source']} | {u['total_uses']} | "
              f"{(u['last_used'] or '-')[:10]} | {', '.join(notes)} |")


# ---------------------------------------------------------------- duplicates

STOP = set("""the a an and or of to for in on with when use used using this that is are be it as
by from you your user users any not into via vs skill skills run make create""".split())


def tokens(text):
    return {w for w in re.findall(r"[a-z][a-z0-9-]{2,}|[가-힣]{2,}", text.lower()) if w not in STOP}


def similar(inv, threshold=0.25, top=40):
    act = [e for e in inv if e["active"]]
    pairs = []
    by_real = {}
    for e in act:
        by_real.setdefault(e["realpath"], []).append(e["id"])
    for ids in by_real.values():
        if len(ids) > 1:
            pairs.append({"a": ids[0], "b": ids[1:], "score": 1.0, "reason": "같은 파일을 가리킴"})
    by_name = {}
    for e in act:
        by_name.setdefault(e["name"], []).append(e["id"])
    for n, ids in by_name.items():
        if len(set(ids)) > 1:
            pairs.append({"a": ids[0], "b": ids[1:], "score": 1.0, "reason": f"같은 이름 '{n}'"})
    seen = {frozenset([p["a"], *p["b"]]) for p in pairs}
    toks = [(e, tokens(e["name"].replace("-", " ") + " " + e["description"])) for e in act]
    for i in range(len(toks)):
        for j in range(i + 1, len(toks)):
            (a, ta), (b, tb) = toks[i], toks[j]
            if not ta or not tb or a.get("plugin") and a.get("plugin") == b.get("plugin"):
                continue
            s = len(ta & tb) / len(ta | tb)
            if s >= threshold and frozenset([a["id"], b["id"]]) not in seen:
                pairs.append({"a": a["id"], "b": [b["id"]], "score": round(s, 2),
                              "reason": "설명 유사: " + ", ".join(sorted(ta & tb)[:8])})
    pairs.sort(key=lambda p: -p["score"])
    return pairs[:top]


# ---------------------------------------------------------------- listing size

def listing():
    measured = None
    files = sorted(transcripts(), key=lambda f: os.path.getmtime(f), reverse=True)[:30]
    for f in files:
        try:
            with open(f, errors="ignore") as fh:
                for line in fh:
                    if '"skill_listing"' not in line:
                        continue
                    d = json.loads(line)
                    a = d.get("attachment") or {}
                    if a.get("type") == "skill_listing" and a.get("isInitial") is not False:
                        c = a.get("content", "")
                        if measured is None or d.get("timestamp", "") > measured["at"]:
                            measured = {"at": d.get("timestamp", ""), "chars": len(c),
                                        "entries": a.get("skillCount"),
                                        "without_description": len(re.findall(r"^- \S+$", c, re.M))}
        except (OSError, ValueError):
            continue
    # project skills only load inside their own project, so leave them out of the global estimate
    inv = [e for e in inventory() if e["active"] and e["model_invocable"] and not e["source"].startswith("project")]
    return {"estimated_full_chars": sum(e["listing_chars"] for e in inv),
            "active_model_invocable": len(inv), "measured_last_session": measured,
            "note": "목록 예산은 컨텍스트의 약 1%. 넘치면 덜 쓰인 스킬부터 설명이 빠짐."}


# ---------------------------------------------------------------- actions

def find(inv, sid):
    """Look up by id; when the same id exists in several places, require '<source>/<id>'."""
    src = None
    if "/" in sid:
        src, sid = sid.split("/", 1)
    m = [e for e in inv if e["id"] == sid and (src is None or e["source"] == src)]
    if not m:
        sys.exit(f"skill not found: {sid}")
    if len(m) > 1:
        opts = ", ".join(f"{e['source']}/{e['id']}" for e in m)
        sys.exit(f"'{sid}' is ambiguous; pick one of: {opts}")
    return m[0]


def journal(action, sid, note=""):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(JOURNAL, "a") as f:
        f.write(json.dumps({"at": iso(now()), "action": action, "id": sid, "note": note},
                           ensure_ascii=False) + "\n")


def movable(e):
    if not e["editable"]:
        sys.exit(f"{e['id']} is {e['source']}-managed; propose changes instead of moving it")
    # a skill dir, or a single command file
    return e.get("dir") or e["path"]


def archive(ids):
    inv = inventory()
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")  # local time, as people read folder names
    manifest_path = os.path.join(ARCHIVE, "manifest.json")
    manifest = load_json(manifest_path, [])
    for sid in ids:
        e = find(inv, sid)
        src = movable(e)
        dst = os.path.join(ARCHIVE, stamp, os.path.basename(src))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.move(src, dst)  # symlinks move as links; the target stays intact
        manifest.append({"id": sid, "from": src, "to": dst, "at": iso(now())})
        journal("archive", sid, dst)
        print(f"archived {sid}: {src} -> {dst}")
    save_json(manifest_path, manifest)


def restore(ids):
    manifest_path = os.path.join(ARCHIVE, "manifest.json")
    manifest = load_json(manifest_path, [])
    for sid in ids:
        rec = next((r for r in reversed(manifest) if r["id"] == sid and not r.get("restored")), None)
        if not rec:
            sys.exit(f"no archive record for {sid}")
        if os.path.lexists(rec["from"]):
            sys.exit(f"refusing to overwrite existing {rec['from']}")
        shutil.move(rec["to"], rec["from"])
        rec["restored"] = iso(now())
        journal("restore", sid, rec["from"])
        print(f"restored {sid} -> {rec['from']}")
    save_json(manifest_path, manifest)


def backup(ids):
    inv = inventory()
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")  # local time, as people read folder names
    for sid in ids:
        e = find(inv, sid)
        src = os.path.realpath(e.get("dir") or e["path"])
        dst = os.path.join(BACKUPS, stamp, e["id"].replace(":", "__"))
        if os.path.isdir(src):
            shutil.copytree(src, dst, symlinks=True)
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst + ".md")
        journal("backup", sid, dst)
        print(f"backed up {sid} -> {dst}")


def override(sid, mode):
    if mode not in ("on", "name-only", "user-invocable-only", "off"):
        sys.exit("mode must be on|name-only|user-invocable-only|off")
    e = find(inventory(), sid)
    if e["source"].startswith("plugin"):
        sys.exit("skillOverrides does not apply to plugin skills; disable the plugin via /plugin instead")
    path = os.path.join(CLAUDE, "settings.json")
    shutil.copy2(path, path + ".bak-skill-cleanup")
    s = load_json(path, None)
    if s is None:
        sys.exit("could not parse settings.json; not touching it")
    ov = s.setdefault("skillOverrides", {})
    if mode == "on":
        ov.pop(sid, None)
    else:
        ov[sid] = mode
    save_json(path, s)
    journal("override:" + mode, sid)
    print(f"skillOverrides[{sid}] = {mode}")


# ---------------------------------------------------------------- snapshots

def snapshot(name):
    inv = inventory()
    act = [e for e in inv if e["active"]]
    snap = {"at": iso(now()), "count_total": len(inv), "count_active": len(act),
            "listing_estimated_chars": sum(e["listing_chars"] for e in act
                                           if e["model_invocable"] and not e["source"].startswith("project")),
            "ids": sorted(e["id"] for e in act),
            "by_source": {}}
    for e in act:
        snap["by_source"][e["source"]] = snap["by_source"].get(e["source"], 0) + 1
    save_json(os.path.join(STATE_DIR, "snapshots", name + ".json"), snap)
    print(json.dumps({k: v for k, v in snap.items() if k != "ids"}, ensure_ascii=False, indent=2))


def compare(a, b):
    A = load_json(os.path.join(STATE_DIR, "snapshots", a + ".json"), None)
    B = load_json(os.path.join(STATE_DIR, "snapshots", b + ".json"), None)
    if not A or not B:
        sys.exit("snapshot missing")
    print(f"| 항목 | {a} | {b} | 변화 |\n|---|---|---|---|")
    for k, label in (("count_active", "활성 스킬 수"), ("listing_estimated_chars", "목록 설명 분량(자, 추정)")):
        print(f"| {label} | {A[k]:,} | {B[k]:,} | {B[k] - A[k]:+,} |")
    for src in sorted(set(A["by_source"]) | set(B["by_source"])):
        x, y = A["by_source"].get(src, 0), B["by_source"].get(src, 0)
        if x != y:
            print(f"| └ {src} | {x} | {y} | {y - x:+} |")
    gone = sorted(set(A["ids"]) - set(B["ids"]))
    new = sorted(set(B["ids"]) - set(A["ids"]))
    if gone:
        print("\n빠진 스킬: " + ", ".join(gone))
    if new:
        print("\n새 스킬: " + ", ".join(new))
    print(f"\n※ 목록 예산(컨텍스트의 약 1%)을 넘는 동안에는 줄어든 분량만큼 다른 스킬의 설명이 다시 들어갑니다.")


# ---------------------------------------------------------------- hook

def hook():
    """SessionStart: one line to the user via systemMessage. Never blocks, never fails loudly."""
    try:
        try:
            payload = json.load(sys.stdin)
        except ValueError:
            payload = {}
        if payload.get("source", "startup") != "startup":
            return
        s = state()
        if not s.get("enabled", True):
            return
        t = now()
        # project skills come and go with the projects you open; only watch installed ones
        inv = [e for e in inventory() if not e["source"].startswith("project")]
        ids = sorted({e["id"] for e in inv})
        active = sum(1 for e in inv if e["active"])
        msgs = []

        known = s.get("known_ids")
        if known is None:
            s["known_ids"] = ids  # first run: baseline silently
            s.setdefault("last_prompt", iso(t))
        else:
            new = [i for i in ids if i not in set(known)]
            if new:
                shown = ", ".join(new[:3]) + (f" 외 {len(new) - 3}개" if len(new) > 3 else "")
                msgs.append(f"새 스킬 {len(new)}개({shown})가 생겼습니다. 기존 스킬과 겹치는지 보려면 /skill-cleanup")
            s["known_ids"] = ids

        last = max([x for x in (parse_iso(s.get("last_run")), parse_iso(s.get("last_prompt"))) if x],
                   default=None)
        due = last is None or (t - last).days >= int(s["interval_days"])
        if due and not msgs:
            since = parse_iso(s.get("last_run"))
            ago = f"{(t - since).days}일 전" if since else "아직 안 함"
            msgs.append(f"스킬 정리 주기가 지났습니다(마지막 정리: {ago}, 활성 스킬 {active}개). "
                        f"/skill-cleanup 으로 점검할 수 있어요. 넘어가면 {s['interval_days']}일 뒤 다시 알립니다.")
        if msgs:
            s["last_prompt"] = iso(t)
            print(json.dumps({"systemMessage": "🧹 " + " / ".join(msgs)}, ensure_ascii=False))
        save_json(STATE, s)
    except Exception:  # a reminder must never break session start
        pass


HOOK_MARK = "skillctl.py\" hook"


def _settings_edit(fn):
    path = os.path.join(CLAUDE, "settings.json")
    s = load_json(path, None) if os.path.exists(path) else {}
    if s is None:
        sys.exit("could not parse settings.json; not touching it")
    if os.path.exists(path):
        shutil.copy2(path, path + ".bak-skill-cleanup")
    changed = fn(s)
    if changed:
        save_json(path, s)
    return changed


def install_hook():
    linked = os.path.join(SKILLS, "skill-cleanup", "scripts", "skillctl.py")
    script = linked if os.path.exists(linked) else os.path.realpath(__file__)
    cmd = f'python3 "{script}" hook 2>/dev/null || true'

    def add(s):
        groups = s.setdefault("hooks", {}).setdefault("SessionStart", [])
        if any(HOOK_MARK in h.get("command", "") for g in groups for h in g.get("hooks", [])):
            return False
        groups.append({"matcher": "startup", "hooks": [{"type": "command", "command": cmd, "timeout": 10}]})
        return True

    print("installed: " + cmd if _settings_edit(add) else "already installed")


def uninstall_hook():
    def rm(s):
        hooks = s.get("hooks") or {}
        groups = hooks.get("SessionStart") or []
        kept = []
        for g in groups:
            hs = [h for h in g.get("hooks", []) if HOOK_MARK not in h.get("command", "")]
            if hs:
                kept.append(dict(g, hooks=hs))
        if kept == groups:
            return False
        if kept:
            hooks["SessionStart"] = kept
        else:
            hooks.pop("SessionStart", None)
        return True

    print("removed" if _settings_edit(rm) else "not installed")


# ---------------------------------------------------------------- main

def main(argv):
    if not argv:
        print(__doc__)
        return
    cmd, args = argv[0], argv[1:]
    if cmd == "inventory":
        print(json.dumps(inventory(), ensure_ascii=False, indent=1))
    elif cmd == "usage":
        print(json.dumps(usage(), ensure_ascii=False, indent=1))
    elif cmd == "table":
        table(usage())
    elif cmd == "similar":
        print(json.dumps(similar(inventory()), ensure_ascii=False, indent=1))
    elif cmd == "listing":
        print(json.dumps(listing(), ensure_ascii=False, indent=1))
    elif cmd == "snapshot":
        snapshot(args[0])
    elif cmd == "compare":
        compare(args[0], args[1])
    elif cmd == "archive":
        archive(args)
    elif cmd == "restore":
        restore(args)
    elif cmd == "backup":
        backup(args)
    elif cmd == "override":
        override(args[0], args[1])
    elif cmd == "log":
        journal(args[0], args[1], " ".join(args[2:]))
    elif cmd == "mark-run":
        s = state()
        s["last_run"] = iso(now())
        s["known_ids"] = sorted({e["id"] for e in inventory() if not e["source"].startswith("project")})
        save_json(STATE, s)
        print("recorded run at " + s["last_run"])
    elif cmd == "config":
        s = state()
        if len(args) == 2:
            k, v = args
            s[k] = int(v) if v.isdigit() else (v.lower() == "true" if v.lower() in ("true", "false") else v)
            save_json(STATE, s)
        print(json.dumps({k: s[k] for k in ("interval_days", "enabled", "last_run", "last_prompt") if k in s},
                         ensure_ascii=False, indent=1))
    elif cmd == "hook":
        hook()
    elif cmd == "install-hook":
        install_hook()
    elif cmd == "uninstall-hook":
        uninstall_hook()
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
