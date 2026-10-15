---
description: hsc 플러그인의 모든 커맨드와 스킬 사용법 안내 (ko/en/jp)
argument-hint: "[ko|en|jp]"
allowed-tools: ""
---

아래 안내문을 출력한다. `$ARGUMENTS`가 `en`이면 영어로, `jp`면 일본어로 번역해서, 그 외에는 한국어 그대로 출력한다. 명령어와 경로는 번역하지 않는다. 다른 말은 덧붙이지 않는다.

```
# 🛠️ hsc

/hsc:notion-log [YYYY-MM-DD]
  그날(기본: 오늘) 모든 프로젝트의 대화를 모아 Notion에 기록합니다.
  일별 페이지(결과 중심 요약 + 대화 원문 하위 페이지)와 주제별 페이지를 만듭니다.
  같은 날짜를 다시 실행하면 일별 페이지는 새로 쓰고, 주제 페이지에는 덧붙입니다.
  토큰·비밀번호 같은 값은 보내기 전에 가립니다.
  설정: /plugin → Installed → hsc → Configure options
        (Notion 키는 키체인에 저장, 매일 자동 기록·어제 기록 알림도 여기서 켜고 끔)

/hsc:digest <주제>
  지금까지의 모든 세션에서 주제와 관련된 대화를 찾아 하나의 종합 문서로 정리합니다.
  예) /hsc:digest Prisma 마이그레이션

/hsc:setup-review
  GitHub 레포에 Claude Code Review(PR 자동 리뷰) 워크플로우를 대화형으로 만듭니다.
  프로젝트를 분석해 리뷰 관점과 리뷰어 페르소나를 제안합니다.

/hsc:find-automation [기간] [프로젝트]
  지난 세션에서 반복되는 일을 찾아 근거와 함께 보여 주고, 고른 것을 스킬·hook·스크립트로 만들어 줍니다.
  2주마다 세션 시작 때 한 번 제안합니다 (끄기: /hsc:find-automation off).

/hsc:skill-cleanup
  안 쓰는·겹치는·낡은 스킬을 사용 기록으로 찾아, 되돌릴 수 있게 정리합니다.

/hsc:design-sample-lab <URL> <요구사항.md>
  설치된 디자인 스킬 전부로 리디자인 시안을 만들고 비교 보드로 정리합니다.

업데이트: /plugin → Marketplaces → hsc → Update marketplace
```
