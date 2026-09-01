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

**아무것도 입력하지 않아도** `/hsc:design-sample-lab`, `/hsc:help`, `/hsc:setting`, `/hsc:setup-review`는 바로 쓸 수 있습니다.

나머지(npm 설치, 심링크, 커맨드 설치, Agent Skill 등록, Hook, launchd)는 자동으로 처리됩니다. Notion 설정이 없으면 Stop Hook과 launchd 자동 수집은 등록하지 않습니다 — 매일 실패할 작업을 걸어둘 이유가 없기 때문입니다.

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

| 계층 | 대상 | 없으면 |
|---|---|---|
| 필수 | Node.js 18+ | 실행 불가 |
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

## 관리

```bash
# design-sample-lab 환경 점검
node ~/.claude/skills/design-sample-lab/scripts/doctor.mjs

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
- Claude Code
