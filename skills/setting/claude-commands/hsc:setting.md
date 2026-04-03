---
name: hsc:setting
description: HSC 스킬에 필요한 Notion API Key, Database ID, Slack Webhook 등을 대화형으로 설정
argument-hint: "[check|reset]"
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# HSC Setting — 대화형 환경 설정

HSC 스킬 사용에 필요한 환경변수를 대화형으로 설정한다.

- 인자 없음 또는 `$ARGUMENTS`가 비어있으면 → **설정 모드** (새로 설정 또는 변경)
- `check` → **확인 모드** (현재 설정 상태만 표시)
- `reset` → **초기화 모드** (설정 삭제 후 재설정)

## 설정 항목

| 항목 | 환경변수 | 필수 | 용도 |
|------|----------|------|------|
| Notion API Key | `NOTION_API_KEY` | **필수** | 모든 Notion 연동 |
| Daily DB ID | `DAILY_DB_ID` | **필수** | `/hsc:notion-log` 일별 기록 |
| Topic DB ID | `TOPIC_DB_ID` | **필수** | `/hsc:notion-log` 주제별 기록 |
| Digest DB ID | `DIGEST_DB_ID` | **필수** | `/hsc:digest` 종합 문서 |
| Slack Webhook URL | `SLACK_WEBHOOK_URL` | 선택 | Slack 알림 (없으면 생략 가능) |

## 설정 파일 위치

두 곳에 .env 파일을 관리한다:
- `~/.claude-notion-logger/.env` → notion-log 스킬용
- `~/.claude-digest/.env` → digest 스킬용

## 실행 순서

### 1. 현재 설정 확인

먼저 기존 .env 파일들을 읽어서 현재 상태를 파악한다.

```bash
cat ~/.claude-notion-logger/.env 2>/dev/null || echo "NOT_FOUND"
```
```bash
cat ~/.claude-digest/.env 2>/dev/null || echo "NOT_FOUND"
```

### 2. 상태 표시

현재 설정 상태를 아래 형식으로 보여준다. 값이 있으면 앞 8자만 표시하고 나머지는 `***`로 마스킹한다.

```
## 📋 현재 HSC 설정 상태

| 항목 | 상태 | 값 |
|------|------|-----|
| Notion API Key | ✅ 설정됨 | `ntn_h404***` |
| Daily DB ID | ✅ 설정됨 | `3330f10b***` |
| Topic DB ID | ❌ 미설정 | — |
| Digest DB ID | ✅ 설정됨 | `3350f10b***` |
| Slack Webhook | ⏭️ 선택사항 | 미설정 |
```

### 3. 분기 처리

**`check` 모드**: 상태 표시 후 종료.

**`reset` 모드**: 사용자에게 "정말 초기화할까요?" 확인 후, 기존 .env 삭제하고 설정 모드로 진입.

**설정 모드** (기본): 미설정 항목이 있으면 하나씩 질문한다. 모두 설정되어 있으면 "변경할 항목이 있나요?"라고 물어본다.

### 4. 대화형 설정

미설정 항목을 순서대로 질문한다. AskUserQuestion 도구를 사용하여 하나씩 입력받는다.

**질문 순서:**
1. **Notion API Key** (필수)
   - 안내: "Notion Integration 페이지(https://www.notion.so/profile/integrations)에서 API Key를 생성하세요."
   - 형식: `ntn_` 또는 `secret_`으로 시작하는 문자열

2. **Daily DB ID** (필수)
   - 안내: "일별 기록용 Notion 데이터베이스의 ID를 입력하세요."
   - 형식: 32자리 hex 문자열 (Notion DB URL에서 추출)
   - 팁: "Notion DB URL: `notion.so/<workspace>/<DB_ID>?v=...` 에서 DB_ID 부분"

3. **Topic DB ID** (필수)
   - 안내: "주제별 기록용 Notion 데이터베이스의 ID를 입력하세요."

4. **Digest DB ID** (필수)
   - 안내: "종합 문서용 Notion 데이터베이스의 ID를 입력하세요."

5. **Slack Webhook URL** (선택)
   - 안내: "Slack 알림을 받으려면 Webhook URL을 입력하세요. 필요 없으면 Enter를 누르세요."

이미 설정된 항목은 현재값을 보여주고 "변경하려면 새 값을, 유지하려면 Enter"라고 안내한다.

### 5. .env 파일 저장

입력받은 값으로 두 .env 파일을 Write 도구로 생성/업데이트한다.

**~/.claude-notion-logger/.env:**
```
NOTION_API_KEY=<입력값>
DAILY_DB_ID=<입력값>
TOPIC_DB_ID=<입력값>
DIGEST_DB_ID=<입력값>
SLACK_WEBHOOK_URL=<입력값 또는 빈 문자열>
```

**~/.claude-digest/.env:**
```
NOTION_API_KEY=<입력값>
DIGEST_DB_ID=<입력값>
SLACK_WEBHOOK_URL=<입력값 또는 빈 문자열>
```

### 6. 연결 테스트

설정 완료 후 Notion API 연결을 테스트한다.

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer <NOTION_API_KEY>" \
  -H "Notion-Version: 2022-06-28" \
  https://api.notion.com/v1/databases/<DAILY_DB_ID>
```

- `200` → "✅ Notion 연결 성공"
- 그 외 → "❌ 연결 실패 — API Key 또는 DB ID를 확인하세요. DB가 Integration에 연결되어 있는지도 확인하세요."

### 7. 완료 메시지

```
## ✅ HSC 설정 완료!

이제 다음 명령어를 사용할 수 있습니다:
- `/hsc:notion-log` — 오늘 세션 기록
- `/hsc:digest <주제>` — 주제별 종합 문서
- `/hsc:help` — 전체 스킬 안내

설정 확인: `/hsc:setting check`
설정 변경: `/hsc:setting`
설정 초기화: `/hsc:setting reset`
```
