---
name: notion-log
description: Claude Code 세션을 Notion에 기록 (오늘 또는 특정 날짜)
argument-hint: "[YYYY-MM-DD]"
allowed-tools: Bash, Read, Write
---

# Notion 세션 로깅

지정된 날짜 (없으면 오늘)의 **모든 Claude Code 세션**을 수집하여 Notion에 기록한다.

- 인자가 없으면: 오늘 날짜
- 인자가 있으면: 해당 날짜 (예: `/notion-log 2026-03-23`)

대상 날짜를 `$TARGET_DATE`로 지칭한다. 인자(`$ARGUMENTS`)가 YYYY-MM-DD 형식이면 그 값을, 아니면 오늘 날짜를 사용.

## 실행 순서

### 1. 세션 수집
```bash
cd ~/.claude-notion-logger && node collect-sessions.js --date $TARGET_DATE
```

### 2. 세션 데이터 읽기
수집된 세션 데이터를 읽어서 분석한다.
```bash
cat /tmp/notion-sessions-$TARGET_DATE.json
```

세션이 0개면 "해당 날짜에 세션이 없습니다"라고 알려주고 종료.

### 3. 분석 JSON 작성
수집된 대화를 분석하여 `/tmp/notion-analysis-$TARGET_DATE.json` 파일을 Write 도구로 생성한다.

JSON 구조:
```json
{
  "summary": "해당 날짜의 한 줄 제목 (결과 중심)",
  "details": "마크다운 요약 (## 섹션, - 결과 bullet, (자동) 세부 항목 포함)",
  "topics": [
    {
      "name": "주제명",
      "tags": ["프로젝트경로명", "기타태그"],
      "details": "주제별 상세 내용 마크다운"
    }
  ]
}
```

#### 분석 규칙
- **summary**: 해당 날짜 작업의 핵심을 한 줄로 (결과 중심)
- **details**: 마크다운 형식으로 **상세하게** 작성
  - `## 제목` 으로 섹션 구분
  - `- 결과 항목` 으로 메인 bullet (결과 중심)
  - `  - (자동) 세부 내용` 으로 Claude가 자동 수행한 작업 표시
  - **코드, SQL, 명령어, 설정값** 등 구체적인 내용이 있으면 반드시 포함
  - "정리했다", "분석했다"만 쓰지 말고 **무엇을 어떻게 정리/분석했는지** 상세히 기술
  - 예시:
    - ❌ "SQL 쿼리 정리"
    - ✅ "voice_group → voice ID 조회 쿼리 정리:\n  - `SELECT id FROM voice_group WHERE name = 'Play Voice'`\n  - Relations 테이블 통해 voice_id 목록 조회"
    - ❌ "관계 체인 분석"
    - ✅ "Voice 엔티티 관계 체인 매핑:\n  - Voice → Style (style.voice_id)\n  - Style → Embedding (embedding.style_id)\n  - Embedding → Source → RecordingSource"
- **topics**: 세션 내용에서 주제를 추출
  - **tags에 프로젝트 경로명 포함**: 예) `/Users/.../studio-app`이면 `studio-app` 태그 추가
  - 하나의 세션이 여러 주제를 다룰 수 있음
  - 같은 주제가 여러 세션에 걸쳐 있으면 하나로 합침
  - **topic의 details도 동일하게 상세히 작성** — 코드/쿼리/설정값 등 구체적 내용 포함

### 4. Notion에 기록
```bash
cd ~/.claude-notion-logger && node log-all-sessions.js /tmp/notion-sessions-$TARGET_DATE.json /tmp/notion-analysis-$TARGET_DATE.json
```

이 스크립트는 자동으로:
- `/tmp/notion-sessions-*.json` (대화 원문)
- `/tmp/notion-analysis-*.json` (분석 결과)
두 파일을 모두 읽어서 기록한다.

결과:
- **일별 페이지**: 요약 details + 대화 기록 하위 페이지
- **주제별 페이지**: 주제별 상세 + 프로젝트 경로 태그
