---
name: skill-cleanup
description: >
  Audit and tidy the installed Claude Code skills: find unused, duplicated and outdated ones from local session history,
  then archive, merge or upgrade them with backups and a before/after report. Use when the user says
  they have too many skills, skills aren't being picked up or "잘 안 불린다", the skill list is cluttered or eats context,
  asks which skills they actually use, wants to clean up / 정리 / 최신화 skills or plugins, just installed a new
  skill or plugin and wonders if it overlaps with existing ones, or follows up on the 🧹 skill-cleanup reminder.
  Not for writing or improving one specific skill (use skill-creator) or for general disk cleanup.
---

# Skill Cleanup

설치된 스킬을 사용 기록 기준으로 점검하고, 사용자가 고른 것만 되돌릴 수 있게 정리한 뒤 무엇이 좋아졌는지 보고한다.

정리의 목적은 스킬 개수를 줄이는 것 자체가 아니다. 스킬 설명 목록은 컨텍스트의 약 1% 예산 안에 들어가야 하고,
넘치면 **덜 쓰인 스킬부터 설명이 잘린다.** 설명이 잘린 스킬은 이름만 남아서 자동 호출이 거의 안 된다.
그래서 안 쓰는 스킬을 걷어내면 정말 쓰는 스킬이 다시 잘 불린다. 이 점을 사용자에게 설명할 때 근거로 쓴다.

## 지켜야 할 것

- **세션 분석은 로컬에서만.** `scripts/skillctl.py`는 집계 수치만 출력한다. 세션 내용을 웹 검색, MCP, 외부 문서에 넣지 않는다.
- **웹 검색에는 스킬 이름과 일반적인 용도만** 쓴다. 사용자의 프로젝트명, 회사, 작업 내용은 넣지 않는다.
- **플러그인·claude.ai 동기화 스킬은 파일을 건드리지 않는다.** 플러그인 비활성화나 제거 명령을 제안만 한다.
- **모든 변경 전에 사용자 확인.** 삭제 대신 보관(이동)하고, 고치거나 통합하기 전에는 백업한다.
- 사용 횟수 0은 "관찰 기간 동안 0"일 뿐이다. 관찰 기간을 항상 같이 말한다.

## 도구

이 파일이 있는 폴더를 `<dir>`라고 하자(스킬 로드 시 "Base directory"로 주어진다). 모든 명령은 `python3 <dir>/scripts/skillctl.py <cmd>`.
경로를 셸 변수에 `"python3 …"`처럼 통째로 담아 실행하지 않는다. zsh는 변수를 단어로 나누지 않아 명령이 통째로 실패한다.

| 명령 | 용도 |
|---|---|
| `table` | 전체 스킬의 사용 횟수·마지막 사용일 표 (적게 쓴 순) |
| `usage` | 같은 내용의 JSON. 설명 원문, 경로, 출처, 활성 여부 포함 |
| `similar` | 중복 후보 쌍 (같은 파일, 같은 이름, 설명 유사도) |
| `listing` | 지난 세션에 실제로 로드된 목록 크기와 설명이 빠진 스킬 수, 현재 추정치 |
| `snapshot <이름>` / `compare <A> <B>` | 작업 전후 비교 |
| `override <id> name-only\|off\|user-invocable-only\|on` | 파일은 두고 노출만 줄임 (개인·프로젝트 스킬만) |
| `archive <id>...` / `restore <id>...` | 보관 폴더로 이동 / 복원. 같은 id가 여러 곳에 있으면 `command/<id>`처럼 출처를 붙인다 |
| `backup <id>...` | 수정 전 복사본 |
| `log <action> <id> <메모>` | 변경 기록에 남기기 |
| `mark-run` | 정리 완료 기록 (주기 알림 초기화) |
| `config interval_days 60` | 알림 주기 변경. `config enabled false`로 끔 |

사용 집계에 쓰는 근거: Skill 도구 호출, 슬래시 커맨드, 다른 스킬이 SKILL.md를 직접 읽은 기록, 프롬프트 기록(`history.jsonl`)의 슬래시 입력.
SessionStart hook이 내용을 주입하는 스킬(예: superpowers:using-superpowers)은 호출 기록이 남지 않으므로 `hook 주입`으로 표시되고, 미사용으로 판단하지 않는다.

## 진행

### 0. 무엇을 원하는지 파악

요청에 따라 범위를 줄인다.
- "새 스킬/플러그인 설치했는데 겹치나?" → `similar`에서 새 스킬이 포함된 쌍만 보고 4단계 없이 끝낸다.
- "스킬이 잘 안 불린다" → `listing`부터 보여주고 원인(설명 잘림)을 설명한 뒤 전체 점검을 제안한다.
- 그 외("너무 많다", "정리해줘", 주기 알림) → 전체 진행.

### 1. 현황 분석

```bash
python3 <dir>/scripts/skillctl.py snapshot before-$(date +%Y%m%d)
python3 <dir>/scripts/skillctl.py table
python3 <dir>/scripts/skillctl.py listing
python3 <dir>/scripts/skillctl.py similar
```

요약해서 보여줄 것: 출처별 스킬 수, 관찰 기간, 실제로 쓴 스킬 목록, 목록 예산 상황(지난 세션에서 설명이 빠진 스킬 수).
Claude Code에 `/skill-doctor`가 있으면 교차 확인용으로 사용자에게 실행을 권해도 된다.

### 2. 정리 후보 만들기

후보마다 **판단 근거**를 쓴다. 근거 없이 "안 쓰니까 지우자"는 안 된다.

**미사용 → 노출 줄이기 또는 보관**
- 관찰 기간 동안 0회이고, 아래 예외에 해당하지 않을 때만 후보로 올린다.
- 예외(후보에서 빼거나 "드물지만 중요할 수 있음"으로 표시):
  - 다른 스킬·커맨드가 이 스킬을 부른다 → `table`/`usage`의 `참조됨`(referenced_by)에 나온다. 링크를 따라가며 찾으므로
    `grep -r`보다 정확하다. 참조가 있으면 **참조하는 파일을 직접 열어 맥락을 확인**한다. 로스터의 조건부 항목처럼
    눈에 덜 띄는 섹션도 있으니 일부만 보고 "안 쓴다"고 판단하지 않는다.
  - 분기 보고, 장애 대응, 릴리스처럼 가끔 쓰는 업무용으로 보이는 설명
  - 관찰 기간보다 최근에 설치됨 (파일 수정일 확인)
  - `hook 주입` 표시
- 권장 조치 강도: 확신이 약하면 `name-only`(이름만 노출, 파일 유지), 확실하면 보관. 가장 가벼운 조치를 먼저 권한다. 되돌리기가 쉬워야 사용자가 부담 없이 고른다.
- gstack처럼 한 묶음으로 설치된 스킬은 개별이 아니라 묶음 단위로 제안한다. 묶음 안에서 쓰는 것만 남길 수 있는지도 본다.
- 플러그인 스킬은 플러그인 단위로만 끌 수 있다. 플러그인 안 스킬 사용 현황을 합쳐서 "플러그인 비활성화 제안"으로 올린다.

**중복 → 통합**
- `similar` 결과는 후보일 뿐이다. 두 SKILL.md를 직접 읽고 판단한다.
- 같은 파일을 가리키는 경우(스킬 + 커맨드 링크 등): 하나만 남긴다.
- 개인 폴더에 플러그인 스킬의 사본이 있는 경우: 업데이트를 받는 쪽(플러그인)을 남기고 사본을 보관하는 쪽을 기본으로 권한다. 사용자가 사본을 고쳐 썼는지 diff로 먼저 확인한다.
- 역할이 겹치지만 내용이 다르면: 통합안(어느 쪽을 기반으로, 무엇을 가져올지)을 한 줄로 쓴다.

**레거시 → 업그레이드**
- 사용 중이거나 중요한 스킬 위주로 확인한다. 안 쓰는 스킬을 업그레이드할 이유는 없다.
- 웹 검색으로 확인할 곳: 공식 스킬 저장소(anthropics/skills), 플러그인 마켓플레이스, Claude Code 내장 기능(공식 문서의 skills·commands 페이지), 원 저자의 새 버전.
- 검색어 예: `"<스킬 이름>" claude code skill`, `claude code skill <일반 용도>`. 개인 작업 내용은 넣지 않는다.
- 대체재를 찾으면 출처 링크, 무엇이 나아졌는지, 갈아탈 때 잃는 것을 함께 쓴다. 확인되지 않은 것은 "확인 못 함"이라고 쓴다.

**후보 목록 형식** (번호를 이어서 매긴다)

```
## 보관·노출 줄이기 후보
1. gstack 묶음 (56개) — 5주간 2회(gstack-qa). 근거: … → 권장: browse만 남기고 나머지 name-only
2. …

## 통합 후보
7. critique-color ↔ visual-critique:critique-color — 같은 내용(diff 없음). → 개인 사본 보관

## 업그레이드 후보
9. … — 대체: <링크>. 나아지는 점: … / 잃는 점: …

## 플러그인 (제안만)
11. designer-skills/ux-strategy — 12개 중 사용 0. → `/plugin` 에서 비활성화
```

마지막에 "번호를 골라주세요 (예: 1,3,7-9)"라고 묻는다.

### 3. 실행

고른 번호마다 실제로 무엇을 할지(명령, 이동 경로)를 보여주고 확인을 받은 뒤 실행한다. 한꺼번에 확인받아도 되지만 목록은 다 보여준다.

- 노출 줄이기: `override <id> name-only` (또는 `off`)
- 보관: `archive <id>...` → `~/.claude/skill-cleanup/archive/<시각>/`. 복원은 `restore <id>`
- 통합: 관련 스킬 모두 `backup` → 통합된 SKILL.md 작성(skill-creator가 있으면 그 규칙을 따른다) → 흡수된 쪽 `archive` → `log merge <id> "<무엇을 합쳤는지>"`
- 업그레이드: 기존 스킬 `backup` → 새 스킬 설치. 플러그인 설치는 사용자가 `/plugin install …`을 직접 실행해야 하므로 명령을 안내한다 → **전후 비교**:
  1. 그 스킬이 원래 하던 일을 대표하는 입력 1~2개를 사용자와 정한다(가능하면 실제로 했던 작업과 비슷하게, 단 민감한 내용은 빼고).
  2. 서브에이전트 두 개를 동시에 띄운다. 하나는 백업본 SKILL.md 경로, 하나는 새 스킬 경로를 주고 같은 입력을 수행시킨다. 결과는 스크래치 폴더에 저장한다.
  3. 결과를 나란히 놓고 차이를 정리한다(품질, 빠진 것, 걸린 시간·토큰).
  4. 새 쪽이 못하면 `restore`/백업으로 되돌릴지 묻는다.
- 플러그인: 실행하지 않는다. 사용자가 할 명령만 안내한다.

### 4. 개선 보고서

```bash
python3 <dir>/scripts/skillctl.py snapshot after-$(date +%Y%m%d)
python3 <dir>/scripts/skillctl.py compare before-YYYYMMDD after-YYYYMMDD
python3 <dir>/scripts/skillctl.py mark-run
```

보고서 구성:

```
# 스킬 정리 보고서 (YYYY-MM-DD)
## 요약 — 한두 문장: 무엇이 좋아졌는지
## 숫자로 본 변화 — compare 표 (활성 스킬 수, 목록 설명 분량)
   목록 예산을 넘고 있었다면: 지난 세션에서 설명이 빠졌던 스킬 수와, 이제 예산 안에 들어오는지
## 한 일 — 보관 / 노출 줄임 / 통합 / 교체, 각각 스킬 이름과 한 줄 이유
## 업그레이드 전후 비교 — 입력, 이전 결과, 새 결과, 차이
## 되돌리는 법 — restore 명령, override on, 백업 위치
## 다음에 볼 것 — 이번에 보류한 후보
```

실제 측정값은 다음 세션부터 반영된다. 새 세션에서 `listing`을 다시 돌리면 확인할 수 있다고 알려준다.
보고서를 파일로 남기길 원하면 사용자가 지정한 위치에 저장한다.
