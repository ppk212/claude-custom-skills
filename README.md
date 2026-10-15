# Claude Custom Skills

Claude Code에서 사용하는 커스텀 스킬 모음. 세션 자동 기록, 알림 등 개인 워크플로우를 자동화합니다.

## 세팅

```bash
git clone git@github.com:ppk212/claude-custom-skills.git
cd claude-custom-skills
./setup.sh
```

`setup.sh`가 물어보는 값은 **전부 선택 입력**입니다. Enter로 건너뛰면 그 값이 필요한 스킬만 비활성화되고 나머지는 정상 설치됩니다.

| 입력값 | 없으면 못 쓰는 것 |
|---|---|
| Notion API Key | `/hsc:notion-log`, `/hsc:digest` |
| Daily DB ID · Topic DB ID | `/hsc:notion-log` |
| Digest DB ID | `/hsc:digest` |
| Slack Webhook URL | 알림만 안 감 (기록 자체는 정상) |

무엇을 못 쓰게 되는지는 설치가 끝나면 요약으로 알려줍니다. 나중에 `skills/<스킬>/.env`를 채우고 `./setup.sh`를 다시 실행하면 활성화됩니다.

**아무것도 입력하지 않아도** `/hsc:design-sample-lab`, `/skill-cleanup`, `/hsc:help`, `/hsc:setting`, `/hsc:setup-review`는 바로 쓸 수 있습니다.

나머지(npm 설치, 심링크, 커맨드 설치, Agent Skill 등록, Hook, launchd)는 자동으로 처리됩니다. Notion 설정이 없으면 Stop Hook과 launchd 자동 수집은 등록하지 않습니다 — 매일 실패할 작업을 걸어둘 이유가 없기 때문입니다.

### 플러그인으로 설치 (find-automation)

`plugins/` 아래 스킬은 Claude Code 플러그인이라 clone이나 `setup.sh` 없이 Claude Code 안에서 바로 설치합니다.

```
/plugin marketplace add ppk212/claude-custom-skills
/plugin install find-automation@hsc
```

Claude Code 2.1.275 이상이면 한 줄로도 됩니다: `/plugin install find-automation --marketplace ppk212/claude-custom-skills`

업데이트는 `/plugin marketplace update hsc`, 삭제는 `/plugin uninstall find-automation@hsc`입니다. 설치·삭제 후에는 Claude Code를 재시작합니다.

## 스킬 목록

### `/hsc:notion-log`

Claude Code 세션 내용을 Notion에 자동 기록하고 Slack으로 알림을 보냅니다.

**구성 요소:**

| 구분 | 설명 |
|------|------|
| Custom Skill | `/hsc:notion-log` 슬래시 커맨드 |
| Stop Hook | 세션 종료 시 로깅 리마인더 |
| Node.js 스크립트 | Notion REST API + Slack Webhook |
| launchd | 매일 자정 어제 세션 자동 수집 |

**사용법:**

```bash
/hsc:notion-log              # 오늘 세션 기록
/hsc:notion-log 2026-03-30   # 특정 날짜 기록
```

**기능:**
- 모든 프로젝트의 세션 자동 수집 (`~/.claude/projects/` JSONL 파싱)
- 일별 페이지: 결과 중심 요약 + `(자동)` 태그로 Claude 작업 구분
- 대화 기록 하위 페이지: 사용자 메시지 원문 보존, 세션별 실행 경로 구분
- 주제별 페이지: 프로젝트 경로 태그, 날짜별 append
- 덮어쓰기 방식: 같은 날 재실행 시 깔끔하게 갱신
- Slack 알림: 프로젝트별/주제별 요약 + Notion 링크

**Notion DB 스키마:**

클로드 사용 기록:
| 컬럼 | 타입 |
|------|------|
| 이름 | title |
| 선택 | select (Claude Code) |
| 생성 날짜 | date |

주제별 기록:
| 컬럼 | 타입 |
|------|------|
| 이름 | title |
| 주제 | multi_select |
| 생성 날짜 | date |
| 수정 날짜 | date |

**파일 구조:**

```
skills/notion-log/
├── .env.example              # API 키 템플릿
├── package.json
├── index.js                  # 단일 세션 로깅
├── collect-sessions.js       # 전체 프로젝트 세션 수집
├── log-all-sessions.js       # Notion + Slack 기록 (메인)
├── log-from-file.js          # JSON 파일 기반 실행
├── stop-hook.sh              # 세션 종료 Hook
├── daily-log.sh              # launchd 매일 실행 스크립트
└── claude-commands/
    └── hsc:notion-log.md     # 슬래시 커맨드 정의
```

### `/hsc:digest`

과거 모든 Claude Code 세션에서 특정 주제 관련 대화를 검색하고, 종합하여 Notion 문서로 생성합니다.

**구성 요소:**

| 구분 | 설명 |
|------|------|
| Custom Skill | `/hsc:digest` 슬래시 커맨드 |
| Node.js 스크립트 | 세션 검색 + Notion REST API + Slack Webhook |

**사용법:**

```bash
/hsc:digest Prisma          # Prisma 관련 모든 대화 종합
/hsc:digest Kubernetes      # K8s 관련 종합 문서 생성
```

**기능:**
- 모든 프로젝트의 모든 세션에서 키워드 검색 (`~/.claude/projects/` JSONL 파싱)
- 관련 대화를 시간순 통합, 중복 제거
- Notion 주제별 DB에 종합 문서 생성/업데이트
- 같은 주제가 있으면 기존 내용에 날짜 구분하여 append
- Slack 알림: 생성/업데이트 상태 전송

**Notion DB 스키마:**

Digest DB (주제별 종합 문서):
| 컬럼 | 타입 |
|------|------|
| 이름 | title |
| 주제 | multi_select |
| 생성 날짜 | date |
| 수정 날짜 | date |

**파일 구조:**

```
skills/digest/
├── .env.example              # API 키 템플릿
├── package.json
├── search-sessions.js        # 전체 세션 키워드 검색
├── digest-to-notion.js       # Notion 종합 문서 생성
└── claude-commands/
    └── hsc:digest.md         # 슬래시 커맨드 정의
```

### `/hsc:design-sample-lab`

라이브 사이트 URL과 요구사항 md를 받아, **설치된 디자인 스킬 전부로 리디자인 시안을 한 번에 만들고** 새 폴더에 스킬별로 정리합니다.

**구성 요소:**

| 구분 | 설명 |
|------|------|
| Agent Skill | `design-sample-lab` — `~/.claude/skills/`에 심링크. 자동 인식 |
| Custom Skill | `/hsc:design-sample-lab` 슬래시 커맨드 (얇은 진입점) |
| Node.js 스크립트 | 환경 점검 · 캡처 · 검증 · 표기 · 비교 보드 생성 |
| 외부 스킬 | 시안을 만드는 디자인 스킬 11종 (아래 의존성 참고) |

**사용법:**

```bash
/hsc:design-sample-lab https://stg.example.com/event ./요구사항.md
```

md 작성법은 [`templates/requirements-template.md`](skills/design-sample-lab/templates/requirements-template.md)에 예시와 함께 있습니다.

**결과물:**

```
design-samples-<도메인>-<YYYY-MM-DD>/
├── README.md              요약 · 추천 · 요구사항 충족표
├── index.html             비교 보드 (데스크톱/모바일/나란히 토글)
├── 00-brief/              요구사항 체크리스트 + 공통 디자인 브리프
├── 01-before/             현재 화면 3뷰포트 + 실측 감사 리포트
├── 02-samples/NN-<스킬>/   시안별 desktop.html · mobile.html · 스크린샷 · NOTES.md
├── 03-review/scorecard.md 시안별 점수 + 요구사항 매트릭스 + 추천
└── canvas/                Claude Design 캔버스 (Artifact 발행용)
```

**동작 방식:**

1. 요구사항 md를 `R1 · R2 · R3 …` 체크리스트로 정규화
2. 현재 사이트를 3뷰포트 캡처하고 실제 렌더된 폰트·색·간격을 집계해 감사
3. 모든 시안이 공유할 **제약**만 담은 브리프 작성 (디자인 방향은 각 스킬이 정함)
4. 스킬별로 서브에이전트를 병렬 실행 → 시안마다 데스크톱·모바일 HTML + NOTES
5. 기계 검증 → 생성 스킬 표기 → 원본 해상도 캡처
6. 스코어카드 · 비교 보드 · 캔버스 · README 생성

**핵심 설계:** 시안은 "예쁜 페이지"가 아니라 **md에 적힌 문제 하나하나에 대한 답변**입니다. 각 시안의 `NOTES.md`에는 요구사항 ID 전부에 대한 충족표가 강제되고, 못 지킨 항목은 이유와 함께 ❌로 남습니다.

**의존성 — 다른 PC에서 쓰기 전에 확인:**

```bash
node skills/design-sample-lab/scripts/doctor.mjs
```

설치된 것과 빠진 것을 표로 보여주고, 빠진 것의 설치 명령까지 출력합니다. **전부 없어도 동작합니다** — 있는 스킬만 실행하고, 없는 것은 결과 README에 "미설치로 제외"로 기록됩니다.

처음 설치라면 아래를 한 번에 실행해도 됩니다. 명령은 `roster.json`의 `sources`와 같습니다.

```bash
# taste-skill — 레포 폴더명과 스킬 이름이 달라 name 값으로 복사한다
rm -rf /tmp/taste-skill && git clone --depth 1 https://github.com/Leonxlnx/taste-skill /tmp/taste-skill
for d in /tmp/taste-skill/skills/*/; do
  n=$(sed -n 's/^name: *//p' "$d/SKILL.md" | head -1)
  [ -n "$n" ] && cp -R "$d" ~/.claude/skills/"$n"
done

# 플러그인 — install은 한 번에 하나씩
claude plugin install frontend-design@claude-plugins-official -s user -y
claude plugin install playwright@claude-plugins-official -s user -y
claude plugin marketplace add Dammyjay93/interface-design
claude plugin install interface-design@interface-design -s user -y
claude plugin marketplace add pbakaus/impeccable
claude plugin install impeccable@impeccable -s user -y
claude plugin marketplace add Owl-Listener/designer-skills
claude plugin install design-systems@designer-skills -s user -y
claude plugin install ui-design@designer-skills -s user -y
claude plugin install visual-critique@designer-skills -s user -y

# 캡처용 browse 바이너리 — ~/.claude/skills 아래에 두거나 ./setup을 돌리면 gstack 스킬 60개가 등록된다
brew install bun
git clone --depth 1 https://github.com/garrytan/gstack ~/.local/share/gstack
(cd ~/.local/share/gstack && bun install && bun build --compile browse/src/cli.ts --outfile browse/dist/browse)
```

설치 후 **Claude Code를 완전히 종료했다가 다시 켜고** doctor를 다시 돌립니다.

| 계층 | 대상 | 없으면 |
|---|---|---|
| 필수 | Node.js 18+ (`impeccable` 훅까지 쓰려면 22+) | 실행 불가 |
| 캡처 | [gstack](https://github.com/garrytan/gstack)의 `browse` 바이너리 | Playwright MCP로 대체. 둘 다 없으면 스크린샷 없이 진행 |
| 캡처 | `sips` (macOS 기본) | 캔버스 썸네일 단계 건너뜀 |
| 시안 생성 | [taste-skill](https://github.com/Leonxlnx/taste-skill) 8종, 공식 `frontend-design`, `interface-design`, 내장 `design` | 있는 것만 실행 |
| 품질 검증 | `impeccable`, `designer-skills`의 critique 계열 | 스코어카드 정확도 하락 |
| 선택 | `OPENAI_API_KEY` 또는 `~/.gstack/openai.json` | 이미지 생성 계열 4종 제외 (11종 → 15종) |

로스터는 [`references/roster.json`](skills/design-sample-lab/references/roster.json)이 단일 출처입니다. 스킬을 추가·제거하려면 이 파일과 `references/skill-roster.md`를 함께 고칩니다.

> **플러그인 스킬 주의:** `claude plugin install`로 설치한 스킬은 **Claude Code를 재시작해야** 등록됩니다. 재시작 없이 쓰려면 플러그인 캐시의 `skills/<이름>` 폴더를 `~/.claude/skills/`로 복사하세요. 이걸 놓치면 스킬이 조용히 다른 스킬로 폴백해 같은 시안이 두 번 나옵니다.

**파일 구조:**

```
skills/design-sample-lab/
├── SKILL.md                          # Agent Skill 본체 (6단계 파이프라인)
├── references/
│   ├── skill-roster.md               # 어떤 스킬이 몇 번 시안을 만드는지
│   └── roster.json                   # 위 로스터의 기계 판독본
├── templates/
│   └── requirements-template.md      # 요구사항 md 작성법 + 실제 예시
├── scripts/
│   ├── doctor.mjs                    # 환경·의존성 점검
│   ├── capture.mjs                   # 스크린샷 (folds = 원본 해상도 / samples = 전체)
│   ├── validate-samples.mjs          # HTML 잘림·더미 카피·요구사항 누락 검사
│   ├── label-samples.mjs             # 생성 스킬 표기 (--remove로 제거)
│   └── build-board.mjs               # 비교 보드 index.html 생성
└── claude-commands/
    └── hsc:design-sample-lab.md      # 슬래시 커맨드 정의
```

### `/skill-cleanup`

설치된 스킬(개인·프로젝트·플러그인·claude.ai)을 **로컬 세션 기록과 대조해** 안 쓰는 것, 겹치는 것, 낡은 것을 근거와 함께 번호 목록으로 보여주고, 고른 것만 되돌릴 수 있게 정리한 뒤 전후 보고서를 냅니다.

스킬이 많아지면 컨텍스트의 약 1%로 정해진 스킬 목록 예산을 넘고, **덜 쓰인 스킬부터 설명이 잘려 자동 호출이 안 됩니다.** 정리하면 실제로 쓰는 스킬이 다시 잘 불립니다.

**구성 요소:**

| 구분 | 설명 |
|------|------|
| Agent Skill | `skill-cleanup` — `~/.claude/skills/`에 심링크. "스킬이 너무 많아", "스킬이 잘 안 불려", "새 플러그인 깔았는데 겹치나?" 같은 말에 자동 호출 |
| Python 스크립트 | `scripts/skillctl.py` — 표준 라이브러리만 사용. 집계·중복 탐지·보관·복원·백업·전후 비교 |
| SessionStart Hook | 주기(기본 30일)가 지났거나 새 스킬이 설치되면 세션 시작 시 한 줄 알림. 넘기면 다음 주기까지 조용함. 모델 컨텍스트는 쓰지 않음 |

**사용법:**

```bash
/skill-cleanup                     # 전체 점검 → 후보 번호 목록 → 고른 것만 실행
```

**지우지 않습니다.** 조치는 세 가지이고 모두 되돌릴 수 있습니다.

| 조치 | 되돌리기 |
|---|---|
| 설명만 숨김 (`skillOverrides: name-only`) — 파일 유지, 이름으로 호출 가능 | `skillctl.py override <id> on` |
| 보관 — `~/.claude/skill-cleanup/archive/`로 이동 | `skillctl.py restore <id>` |
| 수정·통합 전 백업 — `~/.claude/skill-cleanup/backups/` | 백업 폴더에서 복사 |

플러그인과 claude.ai 스킬은 건드리지 않고 비활성화 방법만 안내합니다.

**원칙:** 세션 기록은 로컬에서만 읽고 집계 수치만 씁니다. 대체 스킬을 찾는 웹 검색에는 스킬 이름과 용도만 넣습니다.

**단독 설치** (이 레포의 다른 스킬 없이):

```bash
git clone git@github.com:ppk212/claude-custom-skills.git
bash claude-custom-skills/skills/skill-cleanup/install.sh            # 스킬 + 알림 hook
bash claude-custom-skills/skills/skill-cleanup/install.sh --no-hook  # 스킬만
bash claude-custom-skills/skills/skill-cleanup/install.sh --uninstall
```

세션 기록은 기본 30일만 보관돼서 "미사용" 판단 근거가 짧습니다. `~/.claude/settings.json`에 `"cleanupPeriodDays": 180`처럼 늘려두기를 권합니다.

**파일 구조:**

```
skills/skill-cleanup/
├── SKILL.md                  # 스킬 정의 (진행 절차, 판단 기준)
├── install.sh                # 링크 + hook 등록 / 해제
├── scripts/skillctl.py       # 집계·실행 도구
└── evals/trigger-evals.json  # 자동 호출 테스트 질의
```

### `/find-automation`

"AI로 뭘 자동화하고 싶어?"라는 질문에 답하기 어려울 때 쓰는 스킬입니다. 로컬 세션 기록에서 반복되는 일을 찾아 번호 목록으로 보여 주고, 고른 것을 실제 자동화(스킬, 슬래시 커맨드, hook, 셸 스크립트, 스케줄 등)로 만들어 테스트까지 합니다.

**구성 요소:**

| 구분 | 설명 |
|------|------|
| Agent Skill | `find-automation` — "이거 맨날 하네", "자동화할 거 없을까?" 같은 말에 자동 호출 |
| Python 스크립트 | `scan_sessions.py` — 표준 라이브러리만 사용, 읽기 전용. 프롬프트 군집·명령 빈도·작업 흐름·세션 카드·근거 추적 |
| SessionStart Hook | 마지막 실행 후 주기(기본 14일)가 지나면 세션 시작 시 한 줄 제안. 넘기면 다음 주기까지 묻지 않음 |
| UserPromptSubmit Hook | "맨날", "또 이거" 같은 반복 표현이 나오면 세션당 한 번 힌트 (끌 수 있음) |

**사용법:**

```bash
/find-automation                    # 최근 30일, 전체 프로젝트
/find-automation 90d my-api         # 기간·프로젝트 지정
/find-automation off | on           # 세션 시작 제안 끄기/켜기
/find-automation hint off           # 반복 표현 힌트 끄기
/find-automation config interval 30 # 제안 주기 변경
```

**흐름:** 세션 분석 → 개인·팀 후보 5~8개(근거 세션, 예상 절약 시간과 계산식, 난이도) → 고른 후보의 자동화 방법 2~4개와 장단점 → 고른 방법으로 구현·테스트(성공·실패 경로)·사용법 안내. 파일을 만들거나 고치기 전에는 항상 확인을 받습니다.

**원칙:** 세션은 로컬에서만 읽고 외부로 보내거나 따로 복사·저장하지 않습니다. 화면에 보이는 인용은 토큰·키·비밀번호·이메일 등을 마스킹합니다. 필요한 건 python3뿐이고, 없으면 hook은 조용히 건너뜁니다.

**파일 구조:**

```
plugins/find-automation/
├── .claude-plugin/plugin.json
├── skills/find-automation/
│   ├── SKILL.md                          # 진행 절차, 후보 찾는 관점, 출력 형식
│   ├── scripts/scan_sessions.py          # summary · cards · trace
│   ├── scripts/state.py                  # 마지막 실행·주기·힌트 설정
│   └── references/automation-methods.md  # 자동화 방법 카탈로그
├── hooks/                                # hooks.json, session_start.py, prompt_hint.py
└── evals/trigger-evals.json              # 자동 호출 테스트 질의
```

## 관리

```bash
# design-sample-lab 환경 점검
node ~/.claude/skills/design-sample-lab/scripts/doctor.mjs

# skill-cleanup: 스킬 사용 현황 / 알림 주기 변경 / 알림 끄기
python3 ~/.claude/skills/skill-cleanup/scripts/skillctl.py table
python3 ~/.claude/skills/skill-cleanup/scripts/skillctl.py config interval_days 60
python3 ~/.claude/skills/skill-cleanup/scripts/skillctl.py config enabled false

# launchd 상태 확인
launchctl list | grep claude

# 실행 로그 확인
cat ~/.claude-notion-logger/logs/launchd-stdout.log

# launchd 중지/재시작
launchctl unload ~/Library/LaunchAgents/com.claude.notion-logger.plist
launchctl load ~/Library/LaunchAgents/com.claude.notion-logger.plist
```

## 환경

- macOS
- Node.js 20+
- Python 3.9+ (skill-cleanup)
- Claude Code
