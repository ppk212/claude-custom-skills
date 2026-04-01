---
name: hsc:digest
description: 과거 모든 세션에서 특정 주제 관련 대화를 찾아 Notion 문서로 정리
argument-hint: "<주제 (한글/영어)>"
allowed-tools: Bash, Read, Write
---

# Digest — 주제별 종합 문서 생성

모든 Claude Code 세션 히스토리에서 **지정한 주제와 관련된 대화**를 검색하고, 종합하여 Notion 주제별 DB에 문서를 생성한다.

인자(`$ARGUMENTS`)가 주제/검색어이다.

## 실행 순서

### 1. 관련 대화 검색
모든 프로젝트의 모든 세션에서 주제 관련 대화를 검색한다.

```bash
cd ~/.claude-digest && node search-sessions.js --query "$ARGUMENTS"
```

### 2. 검색 결과 읽기
```bash
cat /tmp/notion-digest-search.json
```

관련 대화가 0개면 "관련 대화를 찾지 못했습니다"라고 알려주고 종료.

### 3. 종합 문서 JSON 작성
검색된 대화를 분석하여 `/tmp/notion-digest-doc.json` 파일을 Write 도구로 생성한다.

JSON 구조:
```json
{
  "name": "주제명 (명확하고 구체적으로)",
  "tags": ["프로젝트경로명", "기술태그", ...],
  "details": "마크다운 형식의 종합 문서"
}
```

#### 문서 작성 규칙

**구조:**
- `## 개요` — 이 주제가 무엇인지 한 문단으로 설명
- `## 타임라인` — 날짜별로 어떤 작업이 있었는지 시간순 정리
- `## 상세 내용` — 핵심 기술 내용을 주제별로 정리
- `## 코드/쿼리/설정` — 관련 코드, SQL, API, 설정값 등 구체적 내용
- `## 관련 파일` — 언급된 파일 경로 목록
- `## 미해결 사항` — 아직 해결 안 된 것이 있으면 기록

**상세 기록 규칙:**
- **코드, SQL, 명령어, API 엔드포인트, 설정값** 등 구체적인 내용은 반드시 포함
- "분석했다", "정리했다"만 쓰지 말고 **무엇을 어떻게** 했는지 상세히 기술
- 여러 세션에 걸쳐 발견한 내용은 **시간순으로 통합**, 중복 제거
- 각 내용의 출처 날짜를 괄호로 표시 (예: `(3/26)`)

**tags 규칙:**
- 관련 프로젝트 경로명 포함 (예: `voice-hub`, `studio-app`)
- 기술 키워드 포함 (예: `Prisma`, `Kubernetes`, `OpenFGA`)

### 4. Notion에 기록
```bash
cd ~/.claude-digest && node digest-to-notion.js
```

이 스크립트가 주제별 DB에 문서를 생성/업데이트한다.
- 같은 이름의 주제가 있으면: 기존 내용 유지 + 날짜 구분하여 append
- 없으면: 새 페이지 생성
