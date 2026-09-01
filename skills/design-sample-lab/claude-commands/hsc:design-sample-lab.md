---
name: hsc:design-sample-lab
description: URL과 요구사항 md를 받아 설치된 디자인 스킬 전부로 시안을 만들고 새 폴더에 정리
argument-hint: "<URL> <요구사항.md>"
allowed-tools: Skill, Bash, Read, Write, Glob, Grep, Agent, AskUserQuestion
---

# HSC Design Sample Lab

설치된 디자인 스킬을 한 번에 동원해 같은 페이지의 시안을 스킬 수만큼 만들고,
현재 경로에 새 폴더 하나로 정리한다.

**이 커맨드는 얇은 진입점이다.** 실제 절차는 `design-sample-lab` Agent Skill에 있다.

---

## 1단계: 인자 확인

`$ARGUMENTS`에서 URL과 md 경로를 뽑는다.

- URL: `http://` 또는 `https://`로 시작하는 토큰
- md: `.md`로 끝나는 토큰

둘 중 하나라도 없으면 **묻고 멈춘다.** 추측해서 진행하지 않는다.

```
사용법: /hsc:design-sample-lab <URL> <요구사항.md>
예시:   /hsc:design-sample-lab https://stg.example.com/event ./요구사항.md

요구사항 md를 어떻게 쓰는지 모르겠다면:
  ~/.claude/skills/design-sample-lab/templates/requirements-template.md
```

md 파일이 존재하지 않으면 경로를 다시 묻는다.

## 2단계: 환경 점검

```bash
node ~/.claude/skills/design-sample-lab/scripts/doctor.mjs
```

- **필수 항목 실패** → 출력된 안내를 그대로 전달하고 멈춘다
- **시안 생성 스킬이 0개** → 설치 안내를 전달하고 멈춘다
- **일부만 있음** → 몇 종이 실행되고 몇 종을 건너뛰는지 알린 뒤 계속 진행한다
- **캡처 도구 없음** → 스크린샷 없이 진행됨을 알리고 계속한다

점검을 건너뛰지 마라. 시안 생성은 서브에이전트를 여러 개 띄우는 긴 작업이라,
중간에 스킬이 없다는 걸 발견하면 그때까지의 시간이 낭비된다.

## 3단계: 스킬 실행

Skill 툴로 `design-sample-lab`을 invoke하고, 그 스킬의 절차를 따른다.
URL과 md 경로를 인자로 넘긴다.

이 스킬은 **병렬 서브에이전트를 사용한다.** 사용자가 이 커맨드를 실행한 것이
그에 대한 요청이다.

## 4단계: 결과 전달

스킬이 만든 폴더 경로, 비교 보드(`index.html`), 스코어카드 요약, 추천 시안을
전달한다. 건너뛴 스킬이 있으면 그 사실과 이유를 반드시 함께 말한다.

---

## 옵션

| 옵션 | 동작 |
|---|---|
| `--skills a,b,c` | 로스터에서 해당 스킬만 실행 |
| `--pages /a,/b` | 여러 페이지를 대상으로 |
| `--resume <폴더>` | 기존 실행 폴더에서 실패한 시안만 다시 채움 |

## 참고 파일

| 파일 | 용도 |
|---|---|
| `templates/requirements-template.md` | 요구사항 md 작성법 + 예시 |
| `references/skill-roster.md` | 어떤 스킬이 몇 번 시안을 만드는지 |
| `references/roster.json` | 위 로스터의 기계 판독본 |
| `scripts/doctor.mjs` | 환경 점검 |
