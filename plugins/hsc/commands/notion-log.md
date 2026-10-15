---
description: 하루 동안의 Claude Code 대화를 모든 프로젝트에서 모아 Notion 일별·주제별 페이지로 기록 (오늘 또는 특정 날짜)
argument-hint: "[YYYY-MM-DD]"
allowed-tools: Bash(node:*), Read, Write
---

# Notion 세션 기록

`$ARGUMENTS`가 `YYYY-MM-DD`면 그 날짜, 아니면 오늘(로컬 시간)을 대상으로 한다. 아래에서 `<DATE>`라고 부른다.

## 1. 대화 수집

```bash
node "${CLAUDE_PLUGIN_ROOT}/notion-log/collect-sessions.js" --date <DATE>
```

- `기록할 대화가 없습니다`가 나오면 그대로 알리고 끝낸다.
- 출력 끝의 `sessions:` 경로를 Read로 읽고, `analysis:` 경로를 기억한다.
- 비밀값(토큰, 비밀번호 등)은 스크립트가 이미 가렸다. 분석 결과에 원래 값을 되살려 쓰지 않는다.
- 파일이 크면 offset/limit로 나눠 읽는다. 세션마다 무엇을 했고 결과가 무엇인지만 파악하면 된다.

## 2. 분석 JSON 작성

`analysis:` 경로에 Write로 아래 형식의 JSON을 쓴다.

```json
{
  "summary": "그날 작업을 결과 중심으로 한 줄",
  "details": "마크다운 요약",
  "topics": [
    { "name": "주제명", "tags": ["프로젝트폴더명", "기술태그"], "details": "주제별 마크다운" }
  ]
}
```

**details 쓰는 법** (Notion 블록으로 바뀐다: `##`/`###` 제목, `-` 목록과 2칸 들여쓴 하위 목록, ``` 코드, `인라인 코드`, **굵게**)
- `## 섹션`으로 프로젝트나 작업 묶음을 나눈다.
- `- 결과` 를 메인 항목으로, Claude가 대신 한 일은 하위 항목 `  - (자동) ...` 으로 적는다 (회색으로 표시됨).
- "정리했다", "분석했다"로 끝내지 말고 무엇을 어떻게 했는지 쓴다. 명령어, SQL, 설정값, 파일 경로처럼 나중에 다시 찾을 구체적인 내용을 넣는다.
  - ❌ `- SQL 쿼리 정리`
  - ✅ `- voice_group → voice ID 조회 쿼리 정리` + 하위 항목 `` `SELECT id FROM voice_group WHERE name = 'Play Voice'` ``

**topics**
- 세션을 가로질러 같은 주제는 하나로 합친다. 한 세션이 여러 주제를 다룰 수 있다.
- `tags`에 프로젝트 폴더명(cwd의 마지막 부분)을 넣는다. 같은 이름의 주제 페이지가 이미 있으면 날짜 구분선과 함께 뒤에 덧붙여지므로, 이어지는 작업은 이전과 같은 주제명을 쓴다.
- topic의 details도 위와 같은 기준으로 구체적으로 쓴다.

## 3. Notion에 기록

```bash
node "${CLAUDE_PLUGIN_ROOT}/notion-log/log-all-sessions.js" --date <DATE>
```

- 일별 페이지: 요약 + "대화 기록" 하위 페이지. 같은 날짜를 다시 실행하면 새로 작성된다.
- 주제별 페이지: 없으면 만들고, 있으면 덧붙인다.
- Slack Webhook이 설정돼 있으면 알림을 보낸다.
- 성공하면 작업 파일(대화 원문)은 지워진다.

`설정이 없습니다`로 끝나면 `/hsc:setting`을 안내한다. 그 밖의 오류는 메시지를 그대로 전하고, 분석 JSON은 남아 있으니 원인을 고친 뒤 3단계만 다시 실행하면 된다고 알린다.

끝나면 기록한 세션·대화 수, 주제 목록, 출력된 Notion 링크를 짧게 보고한다.
