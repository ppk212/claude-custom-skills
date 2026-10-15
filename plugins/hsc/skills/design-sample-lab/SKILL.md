---
name: design-sample-lab
description: >
  Use when the user hands over a live site URL (STG/운영/로컬) together with a
  markdown file of design problems or requirements and wants redesign options —
  "디자인 샘플 뽑아줘", "여러 시안 만들어줘", "이 URL 리디자인 시안", "스킬별로
  디자인 만들어줘", "지금 디자인 맘에 안 들어 다른 안 보여줘". Also use when they
  ask to redo or extend a previous sample run. Not for implementing one already
  chosen design — that is the individual design skill's job.
---

# Design Sample Lab

설치된 디자인 스킬을 **한 번에 전부 동원해** 같은 페이지의 시안을 스킬 수만큼 만들고,
새 폴더 하나에 스킬별로 정리한다.

**핵심 원칙: 시안은 요구사항 md에 대한 답변이다.** 예쁜 페이지 11개가 아니라, md에
적힌 문제점 하나하나에 대해 11가지 방식으로 답한 결과물이어야 한다. 요구사항 추적이
빠진 시안은 실패한 시안이다.

## 입력

| 입력 | 필수 | 없으면 |
|---|---|---|
| 대상 URL | ✅ | 사용자에게 묻는다 |
| 요구사항 md 파일 경로 | ✅ | 사용자에게 묻는다 |
| 대상 화면 | — | md가 지정하면 따르고, 없으면 URL이 가리키는 그 페이지 하나 |

요구사항 md 작성법을 사용자가 물으면 `templates/requirements-template.md`를 안내한다.

이 파일이 있는 폴더를 `<dir>`라고 하자(스킬 로드 시 "Base directory"로 주어진다). 아래 명령의 `<dir>`는 그 경로로 바꿔 실행한다.

**사전 확인 (Phase 0 전에 반드시 실행):**

```bash
node <dir>/scripts/doctor.mjs
```

어떤 스킬이 실제로 설치돼 있는지, 캡처 도구가 있는지 한 번에 보고한다.
기계 판독이 필요하면 `--json`.

| 결과 | 대응 |
|---|---|
| 필수 항목 실패 | 멈추고 출력된 안내를 전달한다 |
| 시안 생성 스킬 0개 | 멈추고 설치 안내를 전달한다 |
| 일부만 설치됨 | **있는 것만 실행한다.** 없는 스킬을 조용히 빠뜨리지 말고 README에 "미설치로 제외"라고 적는다 |
| 캡처 도구 없음 | Playwright MCP(`mcp__playwright__browser_*`)로 대체. 둘 다 없으면 스크린샷 없이 진행하고 README에 적는다 |

**로스터는 고정이 아니다.** `references/roster.json`이 정의하고, doctor가
`ok: false`로 표시한 항목은 이번 실행에서 제외한다. 11종이 다 있어야 돌아가는
스킬이 아니다.

이 사전 확인을 건너뛰지 마라. Phase 3은 서브에이전트를 여러 개 띄우는 긴 작업이라,
중간에 스킬이 없다는 걸 발견하면 그때까지의 시간이 전부 낭비된다.

## 출력 폴더

실행한 **현재 경로**에 새로 만든다. 이름은 `design-samples-<도메인>-<YYYY-MM-DD>`.
같은 이름이 있으면 `-2`, `-3`을 붙인다 — 기존 폴더를 덮어쓰지 않는다.

```
design-samples-stg.example.com-2026-09-01/
├── README.md                  ← 요약·추천·요구사항 충족표
├── index.html                 ← 비교 보드 (build-board.mjs가 생성)
├── 00-brief/
│   ├── requirements.md        ← md에서 추출한 문제점/요구사항 체크리스트
│   └── design-brief.md        ← 모든 시안이 공유하는 공통 브리프
├── 01-before/
│   ├── desktop-1440.png  tablet-768.png  mobile-375.png
│   ├── audit.json             ← capture.mjs가 생성 (실제 렌더된 폰트/컬러/그림자)
│   └── audit.md               ← 사람이 읽는 감사 리포트
├── 02-samples/
│   └── NN-<스킬명>/
│       ├── desktop.html  mobile.html
│       ├── desktop.png   mobile.png
│       └── NOTES.md
├── 03-review/scorecard.md
└── canvas/samples.dc.html
```

## Phase 0 — 요구사항 정규화

요구사항 md를 읽고 `00-brief/requirements.md`에 **번호가 붙은 체크리스트**로 옮긴다.
번호는 이후 모든 단계에서 시안이 참조할 ID다.

```markdown
| ID | 유형 | 내용 | 검증 방법 |
|----|------|------|-----------|
| R1 | 문제점 | 히어로에서 뭘 하는 서비스인지 3초 안에 안 보임 | 히어로에 가치 제안 한 문장 존재 |
| R2 | 요구사항 | 모바일에서 CTA가 폴드 아래로 밀림 | 375px에서 CTA가 첫 화면 안 |
| R3 | 제약 | 브랜드 컬러 #1E4DB7 유지 | 주 색상으로 사용 |
```

**유형은 문제점 / 요구사항 / 제약 셋 중 하나.** 제약(유지해야 할 것)을 빠뜨리면
시안 전체가 폐기된다 — md에서 "유지", "그대로", "바꾸지 말 것"에 해당하는 문장을
반드시 훑는다. md에 애매한 항목이 있으면 추측하지 말고 사용자에게 묻는다.

## Phase 1 — Before 캡처와 감사

### 1-0. 접근 확인 (로그인 벽)

로그인이 필요한 URL은 캡처가 실패하지 않는다 — **로그인 화면을 캡처하고**, 시안
11개가 전부 로그인 페이지 리디자인이 된다. 그래서 캡처 전에 반드시 확인한다.

```bash
L=<dir>/scripts
node $L/capture.mjs probe --url "<URL>"
```

| exit | 뜻 | 대응 |
|---|---|---|
| 0 | 대상 페이지에 정상 접근 | 바로 캡처 |
| 10 | 로그인 필요로 보임 (401/403, 로그인 경로·다른 호스트로 이동, 비밀번호 입력란) | 아래 로그인 절차 |
| 1 | 접속 실패 | 멈추고 URL·네트워크(VPN 등)를 사용자에게 확인 |

**로그인 절차** — 사용자의 계정 정보를 묻거나 대신 입력하지 않는다. 창만 띄우고 기다린다.

1. `node $L/capture.mjs login --url "<URL>"` — 대상 URL이 열린 Chrome 창이 화면에 뜬다
2. 사용자에게 이렇게 말하고 **응답을 기다린다**:
   > 브라우저 창을 열었습니다. 그 창에서 로그인한 뒤 대상 페이지까지 들어가서 "완료"라고 알려주세요.
3. 사용자가 완료라고 하면 `node $L/capture.mjs resume --url "<URL>"`
4. exit 0이면 캡처로 진행. 또 10이면 판정 이유(`reasons`)를 보여 주고 2번부터 다시.
   사용자가 "그 페이지가 맞다"고 하면(예: 비밀번호 변경 화면이 대상) 그대로 진행한다

- 이 절차는 gstack browse가 있을 때만 쓴다. Playwright MCP로 대체 중이면 그 브라우저
  창에서 사용자에게 로그인을 부탁한 뒤 Playwright로 직접 캡처한다
- browse 데몬은 **실행 폴더(git 루트 또는 cwd)마다 따로** 뜬다. probe·login·resume·before는
  모두 같은 폴더에서 실행한다. 또 30분 동안 명령이 없으면 데몬이 꺼져 로그인 상태가
  사라지므로, 로그인 후에는 바로 캡처한다
- 로그인 창의 프로필(`~/.gstack/chromium-profile`)은 남는다. 다음 실행에서 또 10이
  나와도 창을 열면 이미 로그인돼 있어서 사용자는 "완료"만 말하면 되는 경우가 많다

### 1-1. 캡처

```bash
node <dir>/scripts/capture.mjs \
  before --url "<URL>" --out "<RUN>/01-before"
```

캡처 후 `desktop-1440.png`를 직접 열어 대상 페이지가 맞는지 한 번 더 본다. probe가
놓친 로그인 화면·에러 화면이면 1-0의 로그인 절차로 돌아간다.

세 뷰포트 스크린샷과 `audit.json`(실제 렌더된 폰트·색·라운드·그림자·콘솔 에러)이
생성된다. 그다음 **`redesign-existing-projects` 스킬을 invoke**해서 스크린샷과
audit.json을 함께 보고 `01-before/audit.md`를 쓴다. 여기엔 제네릭 AI 패턴, 위계
붕괴 지점, 요구사항 체크리스트의 각 ID가 현재 화면에서 실제로 어떻게 나타나는지를
적는다.

## Phase 2 — 공통 디자인 브리프

`design-token`, `typography-scale`, `layout-grid` 스킬을 참고해
`00-brief/design-brief.md`를 쓴다.
모든 시안이 공유할 **제약 조건**이지 디자인 방향이 아니다 — 방향은 각 스킬이 정한다.

담을 것: 제품이 무엇인지 / 타깃 / 요구사항 ID별 달성 기준 / 유지해야 할 브랜드 자산 /
실제 카피(현재 사이트에서 가져온 한국어 텍스트) / 필수 섹션 목록 / 접근성 기준(WCAG AA).

## Phase 3 — 스킬별 시안 생성 (병렬)

`references/skill-roster.md`를 읽어 로스터를 확정한다. 로스터의 각 행마다
**Agent 서브에이전트를 1개씩, 한 메시지에 전부 담아 병렬로** 띄운다.
이 스킬을 호출한 것 자체가 병렬 에이전트 사용에 대한 요청이다.

한 번에 띄우는 에이전트가 6개를 넘으면 6개씩 나눠 배치로 돌린다.

### 서브에이전트 프롬프트 (그대로 채워서 사용)

```
너는 시안 1개를 만든다. 담당 스킬: <스킬명>

먼저 Skill 툴로 <스킬명> 을 invoke하고, 그 스킬이 지시하는 방식대로 디자인하라.
동시에 full-output-enforcement 스킬도 invoke해 HTML을 끝까지 쓰게 하라.

읽을 것:
- <RUN>/00-brief/design-brief.md      공통 브리프 (제약)
- <RUN>/00-brief/requirements.md      요구사항 체크리스트 (R1, R2, … ID)
- <RUN>/01-before/audit.md            현재 디자인 감사
- <RUN>/01-before/desktop-1440.png    현재 화면 (Read 툴로 직접 볼 것)
- <RUN>/01-before/mobile-375.png

만들 것 — 정확히 이 3개 파일:

1. <RUN>/02-samples/<NN-스킬명>/desktop.html
   1440px 기준. 단일 파일이며 다음을 포함한다:
   - <title> 과 <meta name="viewport">
   - 인라인 <style> (외부 CSS 파일 금지)
   - 브리프의 필수 섹션 전부 (히어로부터 푸터까지)
   - design-brief.md에 있는 실제 한국어 카피. lorem ipsum·영문 더미 금지
   - 이미지는 CSS 그라디언트/도형 또는 인라인 SVG. 외부 이미지 URL 금지
   - 폰트는 fonts.googleapis.com 만 허용하고 반드시 fallback 스택을 함께 쓴다
   - 코드는 끝까지 쓴다. "<!-- 나머지 섹션 동일 -->" 같은 생략 주석 금지

2. <RUN>/02-samples/<NN-스킬명>/mobile.html
   375px 기준의 별도 파일. desktop을 좁힌 게 아니라 모바일에서 성립하는 구조로
   다시 짠다. 터치 타깃 44px 이상, CTA는 첫 화면 안.

3. <RUN>/02-samples/<NN-스킬명>/NOTES.md
   아래 템플릿 그대로.

작업이 끝나면 다음 한 줄만 보고하라:
DONE <NN-스킬명> | 방향: <한 문장> | 미충족: <R번호 목록 또는 없음>
```

### NOTES.md 템플릿 (서브에이전트 프롬프트에 그대로 넣는다)

```markdown
# <스킬명>

## 방향
이 스킬이 잡은 디자인 방향을 2~3문장으로. 다른 시안과 무엇이 다른지 명시.

## 요구사항 대응
| ID | 충족 | 어떻게 |
|----|------|--------|
| R1 | ✅ | 히어로 H1을 가치 제안 한 문장으로 교체, 서브카피 삭제 |
| R2 | ✅ | 375px에서 CTA를 히어로 안에 고정, 스크롤 전 노출 |
| R3 | ⚠️ | #1E4DB7을 유지했으나 배경 대비 확보 위해 명도를 8% 올림 |

requirements.md의 **모든 ID가 이 표에 있어야 한다.** 못 지킨 항목은 ❌로 적고
왜 못 지켰는지 쓴다. 빠뜨리거나 지어내지 않는다.

## 주요 결정
- 타이포: <폰트와 스케일, 왜>
- 컬러: <팔레트, 왜>
- 레이아웃: <그리드 전략, 왜>

## 트레이드오프
이 방향이 포기한 것.
```

## Phase 4 — 검증 · 표기 · 캡처

순서를 지켜라. 검증에서 걸린 시안을 고친 뒤에 캡처해야 다시 찍는 일이 없다.

```bash
L=<dir>/scripts

# 1) 기계 검증 — 스크린샷으로는 안 보이는 실패를 먼저 잡는다
node $L/validate-samples.mjs --dir "<RUN>/02-samples"

# 2) 생성 스킬 표기 — 시안이 폴더 밖으로 나가도 출처가 남는다
node $L/label-samples.mjs --dir "<RUN>/02-samples"

# 3) 캡처 — 원본 해상도 첫 화면 + 전체 페이지 개요
node $L/capture.mjs folds   --dir "<RUN>/02-samples"
node $L/capture.mjs samples --dir "<RUN>/02-samples"
```

**`validate-samples.mjs`가 FAIL을 내면 그 시안을 다시 띄운다.** HTML 잘림, 외부
이미지 URL, lorem ipsum, `NOTES.md`의 요구사항 ID 누락, 4px 배수 아닌 간격 토큰,
font-size 종류 초과를 잡는다. 스크린샷만 봐서는 절대 안 보이는 것들이다.

**`label-samples.mjs`** 는 각 HTML 최상단에 `NN · 스킬명` 정적 스트립과 `<title>`
접두어, 첫 줄 주석을 넣는다. 고정 배지가 아니라 정적 요소라 히어로나 스티키 CTA를
가리지 않는다. 구현으로 넘길 때는 `--remove`로 전부 제거된다.

**캡처는 두 종류다.** `folds`는 뷰포트를 키워 `--viewport`로 찍은 원본 해상도
첫 화면(판독용), `samples`는 전체 페이지(구조 개요용). 전체 페이지는 캡처 도구가
높이 2000px로 캡핑하며 통째로 축소하므로 긴 페이지는 글자를 읽을 수 없다 —
비교 보드와 캔버스는 반드시 `*-fold.png`를 쓴다.

스크립트가 "no desktop.html"을 보고하면 해당 서브에이전트가 실패한 것이다 —
그 스킬만 다시 띄운다.

## Phase 5 — 검증과 정리

1. **스코어카드** — `impeccable:impeccable`, `visual-critique:critique-visual-hierarchy`,
   `visual-critique:critique-typography`, `visual-critique:critique-color` 스킬로 시안별 평가, `03-review/scorecard.md`에 표로.
   열: 시안 / 요구사항 충족(n/총) / 위계 / 타이포 / 컬러 / 모바일 / 접근성 / 총평.
2. **접근성** — `Agent(subagent_type: "design-review")`로 상위 3개 시안만 WCAG AA
   검증 (전부 돌리면 과하다). `design-review`는 스킬이 아니라 에이전트다.
3. **비교 보드**
   ```bash
   node <dir>/scripts/build-board.mjs \
     --dir "<RUN>" --url "<URL>" --title "<도메인> 리디자인 시안"
   ```
4. **캔버스** — 내장 `design` 스킬로 `canvas/samples.dc.html`을 만들어 전체 시안을
   아트보드로 한 캔버스에 올리고 Artifact로 발행한다. 링크를 README에 적는다.
5. **README.md** — 시안 목록, 요구사항 ID × 시안 충족 매트릭스, 추천 1~2안과 근거,
   제외된 스킬과 그 이유(예: "imagegen 4종 — OpenAI 키 없음").

## 옵션

| 옵션 | 동작 |
|---|---|
| `--skills a,b,c` | 로스터에서 해당 스킬만 실행 |
| `--pages /a,/b` | 여러 페이지. 시안 폴더 안에 `<페이지>-desktop.html` 형태로 |
| `--resume <폴더>` | 기존 실행 폴더에 실패한 시안만 다시 채운다 |

## 흔한 실패

| 증상 | 원인 | 대응 |
|---|---|---|
| 시안이 다 비슷하게 나옴 | 공통 브리프가 방향까지 못 박음 | 브리프는 제약만. 미감은 각 스킬에 맡긴다 |
| HTML이 중간에 잘림 | `full-output-enforcement` 미적용 | 서브에이전트 프롬프트에 반드시 포함 |
| NOTES.md에 요구사항 표가 없음 | 템플릿을 프롬프트에 안 넣음 | 템플릿 전문을 프롬프트에 인라인으로 넣는다 |
| 카피가 lorem ipsum | 브리프에 실제 카피가 없음 | Phase 2에서 현재 사이트 한국어 텍스트를 브리프에 옮긴다 |
| 스크린샷이 전부 흰 화면 | HTML이 file:// 에서 외부 리소스 대기 | 외부 이미지 URL 금지 규칙 확인 |
| 보드가 비어 있음 | `02-samples/` 하위 폴더 이름이 `NN-이름` 형식이 아님 | 폴더명 규칙을 맞추고 build-board 재실행 |

## 재실행

`build-board.mjs`와 `capture.mjs`는 순수하게 디스크를 읽어 다시 쓴다. 시안을 손보거나
추가한 뒤 언제든 다시 돌려도 안전하다.
