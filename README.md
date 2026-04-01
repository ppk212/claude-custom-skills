# Claude Custom Skills

Claude Code에서 사용하는 커스텀 스킬 모음. 세션 자동 기록, 알림 등 개인 워크플로우를 자동화합니다.

## 세팅

```bash
git clone git@github.com:ppk212/claude-custom-skills.git
cd claude-custom-skills
./setup.sh
```

`setup.sh` 실행 시 입력할 정보:
- Notion API Key
- Notion DB ID 3개 (일별 / 주제별 / Digest)
- Slack Webhook URL (선택)

나머지(npm 설치, 심링크, Hook, launchd)는 자동으로 처리됩니다.

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

## 관리

```bash
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
