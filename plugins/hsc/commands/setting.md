---
description: hsc 커맨드(notion-log, digest)에 필요한 Notion API Key, DB ID, Slack Webhook을 대화형으로 설정·확인
argument-hint: "[check|reset]"
allowed-tools: Bash(node:*), AskUserQuestion
---

# hsc 설정

설정은 `~/.config/hsc/.env` 한 파일에 저장된다(권한 600, 플러그인 업데이트와 무관). 예전 위치 `~/.claude-notion-logger/.env`, `~/.claude-digest/.env`에 값이 있으면 그것도 읽는다.

**설정 파일을 cat이나 Read로 직접 열지 않는다.** 값이 대화에 그대로 남는다. 항상 아래 스크립트를 쓴다. 스크립트는 값을 가려서 보여 준다.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" status          # 상태
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" set KEY=VALUE   # 저장 (값이 비면 삭제)
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" test            # Notion 연결 확인
```

| 키 | 필요한 곳 |
|---|---|
| `NOTION_API_KEY` | notion-log, digest |
| `DAILY_DB_ID`, `TOPIC_DB_ID` | notion-log |
| `DIGEST_DB_ID` | digest |
| `SLACK_WEBHOOK_URL` | 선택. 기록 후 알림 |
| `NOTION_LOG_REMINDER` | 선택. `off`면 "어제 기록 없음" 세션 시작 알림을 끔 |

## 흐름

1. `status`를 실행해 결과 표를 그대로 보여 준다.
2. `$ARGUMENTS`에 따라:
   - `check` → 여기서 끝.
   - `reset` → "모든 값을 지울까요?"라고 확인받은 뒤 `set NOTION_API_KEY= DAILY_DB_ID= TOPIC_DB_ID= DIGEST_DB_ID= SLACK_WEBHOOK_URL=` 실행 후 3으로.
   - 없음 → 3으로. 다 설정돼 있으면 무엇을 바꿀지 먼저 묻는다.
3. 먼저 무엇을 쓸지 묻는다: notion-log만 / digest만 / 둘 다. 필요한 키만 차례로 AskUserQuestion으로 받는다.
   - **Notion API Key**: https://www.notion.so/profile/integrations 에서 Internal Integration을 만들고 키(`ntn_` 또는 `secret_`로 시작)를 복사한다. 채팅에 키를 붙여 넣고 싶지 않다면, 별도 터미널에서 `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" prompt`를 실행해 직접 입력해도 된다고 안내한다(이때 실제 경로를 풀어서 보여 준다).
   - **DB ID**: DB 페이지 URL을 그대로 붙여 넣어도 된다(스크립트가 32자리 ID만 뽑는다). 각 DB 페이지에서 `⋯ → 연결 → 방금 만든 Integration`을 추가해야 한다고 알려 준다.
   - **Slack Webhook**: 필요 없으면 건너뛴다.
4. 받은 값을 `set`으로 저장한다. 키 값을 응답 본문에 다시 적지 않는다.
5. `test`로 연결을 확인한다. ❌가 있으면 출력된 이유(Integration 미연결, 키 오류)를 전하고 그 항목만 다시 받는다.
6. notion-log가 사용 가능해졌으면 두 가지를 묻는다.
   - 매일 00:00에 어제 대화를 자동 기록할지 (macOS): 원하면 `bash "${CLAUDE_PLUGIN_ROOT}/scripts/schedule.sh" install`. 해제는 `uninstall`.
   - 자동 기록을 안 켠다면, 세션 시작 시 "어제 기록이 없다"는 한 줄 알림을 받을지 (기본 켜짐, 끄려면 `set NOTION_LOG_REMINDER=off`).
7. 마지막 `status` 결과와 함께 쓸 수 있게 된 커맨드(`/hsc:notion-log`, `/hsc:digest`)를 알려 준다.

## Notion DB 속성

DB에는 아래 속성이 있어야 한다. `test`는 접근만 확인하므로, 기록이 속성 오류로 실패하면 이 표를 안내한다.

| DB | 속성 |
|---|---|
| Daily | `이름`(제목), `생성 날짜`(날짜), `선택`(선택: Claude Code) |
| Topic, Digest | `이름`(제목), `주제`(다중 선택), `생성 날짜`(날짜), `수정 날짜`(날짜) |
