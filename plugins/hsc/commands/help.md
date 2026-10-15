---
description: claude-custom-skills(hsc 마켓플레이스) 커맨드와 스킬 사용법 안내 (ko/en/jp)
argument-hint: "[ko|en|jp]"
allowed-tools: ""
---

아래 안내문을 출력한다. `$ARGUMENTS`가 `en`이면 영어로, `jp`면 일본어로 번역해서, 그 외에는 한국어 그대로 출력한다. 명령어와 경로는 번역하지 않는다. 다른 말은 덧붙이지 않는다.

```
# 🛠️ hsc 커맨드

/hsc:setting [check|reset]
  notion-log·digest에 필요한 Notion API Key, DB ID, Slack Webhook을 설정합니다.
  check: 상태만 확인 / reset: 지우고 다시 설정
  값은 ~/.config/hsc/.env 에 저장되고, 대화에는 가려진 값만 표시됩니다.

/hsc:notion-log [YYYY-MM-DD]
  그날(기본: 오늘) 모든 프로젝트의 대화를 모아 Notion에 기록합니다.
  일별 페이지(결과 중심 요약 + 대화 원문 하위 페이지)와 주제별 페이지를 만듭니다.
  같은 날짜를 다시 실행하면 일별 페이지는 새로 쓰고, 주제 페이지에는 덧붙입니다.
  토큰·비밀번호 같은 값은 보내기 전에 가립니다.
  매일 자동 기록: /hsc:setting 마지막 단계에서 켜기 (macOS)

/hsc:digest <주제>
  지금까지의 모든 세션에서 주제와 관련된 대화를 찾아 하나의 종합 문서로 정리합니다.
  예) /hsc:digest Prisma 마이그레이션

/hsc:setup-review
  GitHub 레포에 Claude Code Review(PR 자동 리뷰) 워크플로우를 대화형으로 만듭니다.
  프로젝트를 분석해 리뷰 관점과 리뷰어 페르소나를 제안합니다.

# 같은 마켓플레이스의 다른 플러그인 (설치했을 때만)

/skill-cleanup                    안 쓰는·겹치는 스킬 정리
/design-sample-lab <URL> <md>     리디자인 시안 일괄 생성
/find-automation [기간] [프로젝트]  반복 작업을 찾아 자동화

설치·업데이트: /plugin marketplace update hsc → /plugin
```
