# Claude Custom Skills (hsc)

Claude Code 기능 모음입니다. **플러그인 하나(`hsc`)만 설치하면** 아래 기능을 모두 `/hsc:<이름>`으로 쓸 수 있습니다. 스킬은 이름을 부르지 않아도 "자동화할 거 찾아줘", "스킬이 너무 많아", "이 URL 시안 뽑아줘"처럼 말하면 알아서 불립니다.

| 실행 | 하는 일 | 필요한 것 |
|---|---|---|
| `/hsc:design-sample-lab` | 라이브 URL + 요구사항 md로 디자인 스킬 11종의 리디자인 시안을 한 번에 생성 | Node.js, 디자인 스킬들 |
| `/hsc:find-automation` | 지난 세션에서 반복되는 일을 찾아 자동화(스킬·hook·스크립트)까지 만들어 줌 | python3 |
| `/hsc:skill-cleanup` | 안 쓰는·겹치는·낡은 스킬을 찾아 되돌릴 수 있게 정리 | python3 |
| `/hsc:notion-log`, `/hsc:digest` | 하루치 대화를 Notion에 기록 / 주제별 종합 문서 작성 | Node.js, Notion 키 |
| `/hsc:setup-review` | GitHub 레포에 PR 자동 리뷰(Claude Code Review) 워크플로우 생성 | — |
| `/hsc:help` | 전체 안내 (`/hsc:help en`, `jp`) | — |

---

## 공통 설치 (한 번만)

### 준비물

| 항목 | 비고 |
|---|---|
| macOS | 매일 자동 기록(launchd), 캔버스 썸네일(`sips`)이 macOS 전용 |
| Claude Code | 설치 후 로그인까지 |
| Node.js 18 이상 (22 이상 권장) | `node -v`로 확인. design-sample-lab의 impeccable hook은 22 이상 필요 |
| python3 | macOS 기본 포함. find-automation, skill-cleanup에 사용 (없으면 해당 알림만 조용히 꺼짐) |

### 설치 — 방법 A: Claude Code 안에서 (추천)

```
/plugin marketplace add ppk212/claude-custom-skills
/plugin install hsc@hsc
```

설치 범위는 **Install for you (user scope)**를 고릅니다. 설치할 때 Notion 설정 창이 뜨는데, Notion 연동을 안 쓰면 **전부 비워 두고 넘어가면 됩니다.**

### 설치 — 방법 B: 터미널에서 한 번에

```bash
git clone https://github.com/ppk212/claude-custom-skills.git
cd claude-custom-skills
./setup.sh
```

Claude Code 안에서 `!`로 실행할 때는 입력을 받을 수 없으니 `./setup.sh --yes`로 실행합니다.

> [!WARNING]
> **예전에 `setup.sh`로 설치한 적이 있다면 꼭 방법 B로 한 번 실행하세요.** `~/.claude/commands/hsc:*.md` 복사본, `~/.claude/skills` 심링크, settings.json에 직접 넣은 hook, 따로 배포하던 `skill-cleanup@hsc` 등 개별 플러그인이 남아 있으면 같은 기능이 두 번 뜨거나 **예전 버전이 먼저 실행됩니다.** `setup.sh`가 목록을 보여 주고 정리합니다(settings.json은 백업 후 수정).

### 설치 확인

1. **Claude Code를 완전히 종료했다가 다시 실행**합니다. 플러그인은 재시작해야 적용됩니다.
2. `/hsc:help`를 입력해 6개 기능이 나오면 끝입니다.

### 업데이트 · 삭제

| 하고 싶은 것 | 방법 |
|---|---|
| 업데이트 | `/plugin` → Marketplaces → hsc → **Update marketplace** 후 재시작. 터미널이면 `claude plugin marketplace update hsc && claude plugin update hsc@hsc` (또는 `./setup.sh`) |
| 버전 확인 | `claude plugin list` |
| 삭제 | `/plugin` → Installed → hsc → Uninstall (또는 `./setup.sh --uninstall`) |

**팀 레포에서 설치를 권하려면** 그 레포의 `.claude/settings.json`에 아래를 넣습니다. 팀원이 그 레포에서 Claude Code를 열면 설치 안내가 뜹니다.

```json
{
  "extraKnownMarketplaces": {
    "hsc": { "source": { "source": "github", "repo": "ppk212/claude-custom-skills" } }
  },
  "enabledPlugins": { "hsc@hsc": true }
}
```

---

## 기능별 사용법

제목을 누르면 펼쳐집니다.

<details>
<summary><b>🎨 design-sample-lab — URL 하나로 리디자인 시안 11종 만들기</b></summary>

### 이게 뭔가요

라이브 사이트 URL과 요구사항 md 파일을 주면, Claude Code에 설치된 **디자인 스킬 11종으로 리디자인 시안을 한 번에 만들고** 스킬별로 정리합니다.

- 시안마다 데스크톱·모바일 HTML, 스크린샷, 요구사항 충족표(NOTES.md)가 나옵니다
- 모든 시안을 나란히 비교하는 보드(`index.html`)와 평가표(`scorecard.md`)가 함께 만들어집니다
- 시안은 "예쁜 페이지"가 아니라 **요구사항 md에 적은 문제 하나하나에 대한 답변**입니다. 못 지킨 항목은 이유와 함께 ❌로 남습니다

> [!WARNING]
> 한 번 실행에 서브에이전트가 10개 넘게 병렬로 돕니다. **사용량이 많으니** 상위 요금제를 권장합니다.

### 1. 디자인 스킬 설치 (처음 한 번)

hsc 설치와 별개로, 시안을 만들 디자인 스킬들이 있어야 합니다. 명령은 [`roster.json`](plugins/hsc/skills/design-sample-lab/references/roster.json)의 `sources`와 같습니다.

**1-1. taste-skill 계열 (시안 9종 + 공통 스킬)** — 레포 폴더 이름과 스킬 이름이 달라서 **스킬 이름으로 폴더를 만들어** 복사해야 합니다.

```bash
rm -rf /tmp/taste-skill && git clone --depth 1 https://github.com/Leonxlnx/taste-skill /tmp/taste-skill
for d in /tmp/taste-skill/skills/*/; do
  n=$(sed -n 's/^name: *//p' "$d/SKILL.md" | head -1)
  [ -n "$n" ] && cp -R "$d" ~/.claude/skills/"$n"
done
```

**1-2. 플러그인** — `claude plugin install`은 한 번에 하나씩만 받습니다.

```bash
claude plugin install frontend-design@claude-plugins-official -s user -y
claude plugin install playwright@claude-plugins-official -s user -y

claude plugin marketplace add Dammyjay93/interface-design
claude plugin install interface-design@interface-design -s user -y

claude plugin marketplace add pbakaus/impeccable
claude plugin install impeccable@impeccable -s user -y

claude plugin marketplace add Owl-Listener/designer-skills
claude plugin install design-systems@designer-skills -s user -y
claude plugin install ui-design@designer-skills -s user -y
claude plugin install visual-critique@designer-skills -s user -y
```

**1-3. 스크린샷 도구 (권장)** — 없으면 Playwright로 대체되지만 이게 더 빠르고 안정적입니다. **로그인이 필요한 페이지를 다루려면 사실상 필수**입니다.

```bash
brew install bun
git clone --depth 1 https://github.com/garrytan/gstack ~/.local/share/gstack
cd ~/.local/share/gstack && bun install && bun build --compile browse/src/cli.ts --outfile browse/dist/browse
```

> [!WARNING]
> gstack을 `~/.claude/skills` 아래에 받거나 `./setup`을 실행하지 마세요. 쓰지 않을 gstack 스킬 60개가 한꺼번에 등록됩니다.

| 계층 | 대상 | 없으면 |
|---|---|---|
| 필수 | Node.js 18+ (`impeccable` 훅까지 쓰려면 22+) | 실행 불가 |
| 캡처 | gstack `browse` 바이너리 | Playwright MCP로 대체. 둘 다 없으면 스크린샷 없이 진행 |
| 캡처 | `sips` (macOS 기본) | 캔버스 썸네일 단계 건너뜀 |
| 시안 생성 | taste-skill 8종, `frontend-design`, `interface-design`, 내장 `design` | 있는 것만 실행 |
| 품질 검증 | `impeccable`, `designer-skills`의 critique 계열 | 스코어카드 정확도 하락 |
| 선택 | `OPENAI_API_KEY` 또는 `~/.gstack/openai.json` | 이미지 생성 계열 4종 제외 |

### 2. 설치 확인

**Claude Code를 재시작한 뒤** `/hsc:design-sample-lab`을 인자 없이 실행하면 환경 점검부터 합니다. 터미널에서 직접 보려면:

```bash
node ~/.claude/plugins/cache/hsc/hsc/$(ls ~/.claude/plugins/cache/hsc/hsc | sort -V | tail -1)/skills/design-sample-lab/scripts/doctor.mjs
```

마지막에 `실행 가능. 시안 11종이 생성된다.`가 나오면 준비 완료입니다. 빠진 항목은 ❌와 함께 설치 명령이 출력됩니다. (이미지 생성 계열 4종은 OpenAI 키가 있어야 해서 ❌가 정상입니다.) **전부 없어도 동작합니다** — 있는 스킬만 실행하고, 없는 것은 결과 README에 "미설치로 제외"로 기록됩니다.

<details>
<summary>⚠️ 11번 시안 — 내장 <code>design</code> 스킬 주의</summary>

11번 시안(`11-claude-design-canvas`)과 마지막 단계의 캔버스(`canvas/`)는 Claude Code **내장** `design` 스킬을 씁니다. 따로 설치할 수 없고 doctor도 확인하지 못합니다(항상 `✅ 내장`으로 표시). 계정·버전에 따라 있을 수도 없을 수도 있습니다. `/skills` 목록에 `design`이 있는지로 확인하세요.

**없을 때:** 1~10번 시안·비교 보드·평가표는 정상, 11번 시안은 빠지거나 다른 시안과 비슷하게 나올 수 있고 `canvas/`는 안 만들어질 수 있습니다. 무시하면 됩니다. 즉 **실제로 받는 시안은 10~11종**입니다.

</details>

### 3. 요구사항 md 작성

- **★ 표시는 꼭 채우기**. 그 외 항목은 해당 없으면 **"없음"이라고 적거나 섹션을 지우기** — 빈칸으로 두면 스킬이 다시 물어봅니다
- **문제점에는 증상만** 쓰기. ❌ "히어로를 크게 키워주세요"(해법 지정 → 11개 시안이 같은 답) / ✅ "할인 폭이 첫 화면에서 안 보인다"
- ❌ "미니멀하게 해주세요" → 디자인 방향은 스킬마다 다르게 정합니다. 못 박으면 시안이 다 비슷해집니다

<details>
<summary>요구사항.md 템플릿 (복사해서 빈칸 채우기)</summary>

```markdown
# 리디자인 요구사항

## 1. 목표 ★ (한 줄)
- 목표: 
  (예: 현재 서비스 중인 이벤트 페이지의 디자인을 개선한다)

## 2. 대상
- URL ★: 
- 대상 화면: 
  (비워 두면 URL 페이지 하나만. 여러 개면 /cars, /event 처럼 나열)
- 주 사용 기기: 모바일 / 데스크톱 / 둘 다   ← 하나만 남기고 지우기
- 주 사용자: 
- 주 유입 경로: 

## 3. 현재 상황 ★ (이 페이지가 뭐 하는 곳인지)
- 서비스: 
- 사용자가 이 페이지에서 하는 일: 
- 이 페이지의 성공 기준: 

## 4. 문제점 ★ (증상만 쓰기 — 해법은 쓰지 않기)
1. 
2. 
3. 
   (예: 할인 금액이 첫 화면에서 안 보인다 / 모바일에서 신청 버튼을 찾기 어렵다)
   (X 나쁜 예: 히어로를 크게 키워 달라 / 미니멀하게 바꿔 달라)

## 5. 제약 (선택 — 바뀌면 곤란한 것만. 없으면 "없음")
- 브랜드 컬러: 
- 로고·서비스명 표기: 
- 유지해야 할 문구·명칭: 
- 없애면 안 되는 블록·기능: 
- 법적 고지·필수 문구: 

## 6. 숫자와 사실 (선택 — 화면 값과 실제 값이 다를 때만. 없으면 "없음")
| 항목 | 실제 값 | 화면에 보이는 값 |
|---|---|---|
|  |  |  |

## 7. 기타 메모
- 
```

| 구분 | 필요 여부 | 설명 |
|---|---|---|
| 1. 목표 / 3. 현재 상황 | **필수** | 화면에 안 적힌 사업 맥락은 스킬이 모릅니다 |
| 4. 문제점 | **필수·가장 중요** | 시안 하나하나가 이 항목에 대한 답변이 됩니다 |
| 5. 제약 | 선택 | 없으면 시안마다 색·톤을 자유롭게 정합니다. 바뀌면 곤란한 게 있을 때만 |
| 6. 숫자와 사실 | 선택 | 없으면 현재 화면의 문구·숫자를 그대로 씁니다. 화면 값과 실제 값이 다를 때만 |
| 2. 대상 / 7. 기타 | 선택 | 기기·사용자를 적으면 모바일 우선 여부가 정해집니다 |

예시가 포함된 자세한 설명: [`templates/requirements-template.md`](plugins/hsc/skills/design-sample-lab/templates/requirements-template.md)

</details>

### 4. 실행

결과 폴더가 생길 디렉토리에서 `claude`를 실행한 뒤 입력합니다. "이 URL로 리디자인 시안 뽑아줘"처럼 말로 해도 됩니다.

```
/hsc:design-sample-lab https://stg.example.com/page ./요구사항.md
```

| 옵션 | 동작 |
|---|---|
| `--skills a,b,c` | 특정 스킬만 실행 |
| `--pages /a,/b` | 여러 페이지를 한 번에 |
| `--resume <폴더>` | 기존 실행 폴더에서 실패한 시안만 다시 생성 |

> [!TIP]
> 처음에는 `--skills design-taste-frontend,minimalist-ui`처럼 2~3개로 짧게 돌려 보고, 괜찮으면 전체를 돌리세요.

<details>
<summary>로그인이 필요한 페이지 🧪 검증 중</summary>

로그인이 필요한 URL을 그냥 넘기면 오류 없이 **로그인 화면을 캡처**해서 시안이 전부 "로그인 페이지 리디자인"이 됩니다. 그래서 스킬이 캡처 전에 접근 가능 여부를 확인하고, 막혀 있으면 **Chrome 창을 띄워 직접 로그인하게** 합니다. 아이디·비밀번호를 Claude에게 알려줄 필요가 없고 Claude도 묻지 않습니다.

1. 평소처럼 URL과 요구사항 md로 실행
2. Claude가 로그인 필요 여부를 자동 판별 (401/403, `/login`·`/signin`·`/auth`·`/sso`로 이동, 다른 도메인으로 이동, 비밀번호 입력란)
3. 막혀 있으면 Chrome 창을 띄우고 안내
4. 그 창에서 로그인하고 **시안을 만들 대상 페이지까지 직접 이동**
5. Claude Code에 **완료**라고 입력
6. Claude가 대상 페이지인지 다시 확인한 뒤 캡처 진행

- **창을 닫지 마세요.** 캡처는 그 창에서 진행됩니다
- 창을 띄운 뒤 **30분 넘게 아무것도 안 하면** 브라우저가 꺼지고 로그인이 풀립니다
- 대상 페이지 자체에 비밀번호 입력란이 있으면(예: 비밀번호 변경 화면) 잘못 판단할 수 있습니다. "이 페이지가 맞다"고 답하면 진행합니다
- 1-3의 스크린샷 도구가 있어야 이 흐름대로 동작합니다

</details>

### 5. 결과 보기

```
design-samples-<도메인>-<YYYY-MM-DD>/
├── README.md              요약 · 추천 · 요구사항 충족표
├── index.html             비교 보드 ← 이것부터 열기
├── 00-brief/              요구사항 체크리스트 + 공통 디자인 브리프
├── 01-before/             현재 화면 스크린샷 + 감사 리포트
├── 02-samples/NN-<스킬>/   시안별 desktop.html · mobile.html · 스크린샷 · NOTES.md
├── 03-review/scorecard.md 시안별 점수 + 요구사항 매트릭스 + 추천
└── canvas/                Claude Design 캔버스 (내장 design 스킬이 있을 때만)
```

`open design-samples-*/index.html` — 데스크톱 / 모바일 / 나란히 보기를 전환할 수 있습니다.

### 문제 해결

| 증상 | 해결 |
|---|---|
| doctor에서 taste 계열이 ❌ | 1-1 복사 명령을 다시 실행 (`cp -R taste-skill/skills/*`로 복사하면 폴더 이름이 달라 인식 안 됨) |
| doctor에서 플러그인 스킬이 ❌ | 1-2를 한 줄씩 다시 실행한 뒤 Claude Code 재시작 |
| 시안 두 개가 똑같이 나옴 | 플러그인 설치 후 재시작을 안 한 경우. 재시작 후 `--resume <폴더>` |
| 11번 시안이 없거나 비슷함 / `canvas/` 없음 | 내장 `design` 스킬이 없는 환경. 무시해도 됩니다 |
| 스크린샷이 없음 | 1-3 미설치. Playwright 플러그인도 없으면 스크린샷 없이 진행 |
| 시안이 다 비슷함 | 요구사항 md에 디자인 방향이나 해법을 적었는지 확인 |
| 시안이 전부 로그인 화면 리디자인 / 카피가 lorem ipsum | 로그인이 필요한 페이지. 위 "로그인이 필요한 페이지" 참고 |
| "제약/숫자가 비어 있는데 맞나요?" 질문을 받음 | 해당 없으면 "없음"이라고 답하고, 다음부터 md에 "없음"이라고 적어 두기 |
| `/hsc:design-sample-lab`이 아니라 `/design-sample-lab`만 보임 | 예전 방식 설치가 남아 있음. 공통 설치의 방법 B(`./setup.sh`)로 정리 |

</details>

<details>
<summary><b>🔁 find-automation — 반복 작업을 찾아 자동화까지</b></summary>

### 이게 뭔가요

"AI로 뭘 자동화하고 싶어?"라는 질문에 답하기 어려울 때 씁니다. 내 컴퓨터에 남은 Claude Code 세션 기록을 분석해 **반복되는 일을 근거와 함께** 번호 목록으로 보여 주고, 고른 것을 실제 자동화로 만들어 테스트까지 합니다.

### 사용법

```
/hsc:find-automation                     최근 30일, 전체 프로젝트
/hsc:find-automation 90d my-api          기간·프로젝트 지정 (since 2026-09-01 도 가능)
```

"자동화할 만한 거 찾아줘", "이거 맨날 하네", "내 작업 패턴 분석해줘"처럼 말해도 됩니다.

### 진행 순서

1. **후보 목록** — 개인 작업과 팀·조직 후보로 나눠 5~8개. 각 후보에 근거(몇 번, 어느 세션), 예상 절약 시간과 계산식, 난이도
2. **방법 제안** — 번호를 고르면 스킬 / 슬래시 커맨드 / hook / 셸 스크립트 / 스케줄 등 방법 2~4개와 장단점
3. **구현** — 방법을 고르면 계획을 확인받은 뒤 만들고, 성공·실패 경로를 모두 테스트하고, 사용법을 안내

### 자동으로 하는 것과 끄는 법

| 기능 | 동작 | 끄기·바꾸기 |
|---|---|---|
| 주기 제안 | 마지막 실행 후 14일이 지나면 세션 시작 때 한 줄 제안. 무시하면 다음 주기까지 다시 묻지 않음 | `/hsc:find-automation off` (다시 켜기 `on`), 주기 변경 `/hsc:find-automation config interval 30` |
| 반복 표현 힌트 | "맨날", "또 이거" 같은 말을 하면 세션당 한 번 응답 끝에 한 줄 제안 | `/hsc:find-automation hint off` |

### 원칙

- 세션 기록은 **내 컴퓨터에서만** 읽습니다. 외부로 보내거나 따로 복사·저장하지 않습니다
- 화면에 보이는 인용은 토큰·키·비밀번호·이메일 등을 가립니다
- 파일을 만들거나 고치기 전에는 항상 확인을 받습니다
- 세션 원본은 보통 30일만 남습니다. 오래된 기간은 프롬프트 기록으로 보충하며 근거가 약하다고 알려 줍니다

</details>

<details>
<summary><b>🧹 skill-cleanup — 안 쓰는·겹치는 스킬 정리</b></summary>

### 왜 필요한가요

스킬 설명 목록은 컨텍스트의 약 1% 안에 들어가야 하고, 넘치면 **덜 쓰인 스킬부터 설명이 잘려 자동 호출이 안 됩니다.** 안 쓰는 스킬을 걷어내면 정말 쓰는 스킬이 다시 잘 불립니다.

### 사용법

```
/hsc:skill-cleanup
```

"스킬이 너무 많아", "스킬이 잘 안 불려", "새 플러그인 깔았는데 겹치나?"라고 말해도 됩니다. 설치된 스킬(개인·프로젝트·플러그인·claude.ai)을 세션 사용 기록과 대조해 근거와 함께 번호 목록으로 보여 주고, **고른 것만** 처리한 뒤 전후 비교 보고서를 냅니다.

### 지우지 않습니다 — 모두 되돌릴 수 있음

| 조치 | 되돌리기 |
|---|---|
| 설명만 숨김 — 파일은 두고 이름으로만 호출 가능 | "○○ 스킬 다시 보이게 해줘"라고 요청 |
| 보관 — `~/.claude/skill-cleanup/archive/`로 이동 | "○○ 스킬 복원해줘"라고 요청 |
| 수정·통합 전 백업 — `~/.claude/skill-cleanup/backups/` | 백업 폴더에서 복사 |

플러그인과 claude.ai 스킬은 파일을 건드리지 않고 비활성화 방법만 안내합니다. 세션 기록은 로컬에서만 읽고, 대체 스킬을 찾는 웹 검색에는 스킬 이름과 용도만 넣습니다.

### 주기 알림

30일이 지났거나 새 스킬이 설치되면 세션 시작 때 한 줄로 알려 줍니다. 넘기면 다음 주기까지 조용합니다. 주기 변경·끄기는 "skill-cleanup 알림 주기 60일로 바꿔줘", "skill-cleanup 알림 꺼줘"라고 요청하면 됩니다.

> [!TIP]
> 세션 기록은 기본 30일만 보관돼서 "안 씀" 판단 근거가 짧습니다. `~/.claude/settings.json`에 `"cleanupPeriodDays": 180`처럼 늘려 두기를 권합니다.

</details>

<details>
<summary><b>📝 notion-log · digest — 대화를 Notion에 기록</b></summary>

### 이게 뭔가요

- `/hsc:notion-log [YYYY-MM-DD]` — 그날(기본: 오늘) 모든 프로젝트의 대화를 모아 Notion에 기록합니다. 일별 페이지(결과 중심 요약 + 대화 원문 하위 페이지)와 주제별 페이지를 만듭니다. 같은 날짜를 다시 실행하면 일별 페이지는 새로 쓰고 주제 페이지에는 덧붙입니다
- `/hsc:digest <주제>` — 지금까지의 모든 세션에서 주제 관련 대화를 찾아 하나의 종합 문서(개요·타임라인·코드·미해결)로 정리합니다. 예: `/hsc:digest Prisma 마이그레이션`
- 보내기 전에 토큰·키·비밀번호 같은 값을 가립니다. Slack Webhook을 넣으면 기록 후 알림이 갑니다

### 설정 (처음 한 번)

1. [notion.so/profile/integrations](https://www.notion.so/profile/integrations)에서 Internal Integration을 만들고 키(`ntn_…`)를 복사합니다
2. 기록할 DB를 만들고, 각 DB 페이지의 **⋯ → 연결**에서 그 Integration을 추가합니다
3. Claude Code에서 `/plugin` → **Installed** → hsc → **Configure options**에 키와 DB를 입력합니다. DB는 URL을 그대로 붙여 넣어도 됩니다
4. **새 세션**을 시작하면 적용됩니다

| DB | 필요한 속성 | 쓰는 곳 |
|---|---|---|
| Daily | `이름`(제목), `생성 날짜`(날짜), `선택`(선택) | notion-log |
| Topic | `이름`(제목), `주제`(다중 선택), `생성 날짜`, `수정 날짜`(날짜) | notion-log |
| Digest | Topic과 같음 | digest |

Notion API Key와 Slack Webhook은 **macOS 키체인에 저장**되고 입력할 때 가려집니다. 채팅에 키를 붙여 넣을 필요가 없습니다.

<details>
<summary>설정 값은 어디에 저장되나요</summary>

- Claude Code는 플러그인 설정 값을 hook에만 넘겨 주므로, 세션이 시작될 때 hsc hook이 플러그인 데이터 폴더(`~/.claude/plugins/data/hsc-hsc/config.json`, 권한 600)로 옮겨 두고 스크립트가 그 파일을 읽습니다. 그래서 값을 바꾸면 다음 세션부터 적용됩니다
- 플러그인을 삭제하면 이 폴더도 함께 지워집니다
- 예전 위치(`~/.claude-notion-logger/.env`, `~/.claude-digest/.env`)에 값이 있으면 설정 창에 값이 없을 때 그것을 씁니다

</details>

### 같은 설정 창의 켜기/끄기

| 항목 | 기본 | 동작 |
|---|---|---|
| 매일 자동 기록 (macOS) | 꺼짐 | 켜면 다음 세션 시작 때 launchd에 등록되고, 매일 00:00에 어제 대화를 자동으로 기록. 끄면 등록 해제 |
| 어제 기록 알림 | 켜짐 | 자동 기록을 끈 경우, 어제 대화가 기록되지 않았으면 세션 시작 때 하루 한 번 알림 |

> [!NOTE]
> 🧪 **검증 중** (2026-10-16 개편): 가짜 Notion 서버로 수집→기록 전체 흐름은 테스트했지만, 실제 Notion 기록과 자동 기록(launchd) 실행은 아직 검증 전입니다.

### 문제 해결

| 증상 | 해결 |
|---|---|
| "설정이 없습니다" | Configure options에 값을 넣은 뒤 **새 세션**에서 다시 실행 (값은 세션 시작 때 반영됨) |
| 404 / Integration 미연결 | DB 페이지 ⋯ → 연결에서 Integration 추가 |
| 속성 관련 오류 | 위 표의 속성 이름·종류가 DB와 같은지 확인 |
| 연결 상태를 직접 보고 싶음 | `node plugins/hsc/scripts/config.js status` / `test` (clone 폴더 기준) |

</details>

<details>
<summary><b>🤖 setup-review — PR 자동 리뷰 워크플로우 만들기</b></summary>

### 이게 뭔가요

GitHub 레포에 **PR이 열리면 Claude가 자동으로 코드 리뷰를 남기는** GitHub Actions 워크플로우(`.github/workflows/claude-code-review.yml`)를 대화형으로 만듭니다. 공식 [`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action)을 씁니다.

### 사용법

리뷰를 붙일 레포 폴더에서 Claude Code를 열고:

```
/hsc:setup-review
```

1. 프로젝트를 분석해 언어·프레임워크를 감지하고, 프로젝트에 맞는 **리뷰어 페르소나**를 제안합니다
2. 모델(`claude-sonnet-5-5` 추천 / `claude-opus-5-5`), 리뷰 언어, 라벨로 재리뷰 요청, 코멘트 하나만 유지(sticky) 여부를 묻습니다
3. 워크플로우 파일을 만들고 내용을 보여 줍니다

### 만든 뒤 할 일

- GitHub 레포 **Settings → Secrets and variables → Actions**에 Secret `ANTHROPIC_API_KEY`(또는 정한 이름) 추가
- 코멘트를 `claude[bot]` 이름으로 남기려면 [Claude GitHub App](https://github.com/apps/claude) 설치. 없으면 `github-actions[bot]`으로 남습니다
- 파일을 커밋하고 PR을 하나 열어 리뷰가 달리는지 확인
- 모델은 파일을 고치지 않고 Actions Variable `ANTHROPIC_MODEL`로 바꿀 수 있습니다

</details>

---

## 공통 문제 해결

| 증상 | 해결 |
|---|---|
| `/hsc:` 명령이 안 보임 | 설치 후 Claude Code 재시작. `claude plugin list`에 `hsc@hsc`가 enabled인지 확인 |
| 같은 기능이 두 번 보이거나 예전 동작을 함 | 예전 방식 설치가 남아 있음. 레포를 받아 `./setup.sh` 실행 |
| 업데이트했는데 그대로임 | `claude plugin update hsc@hsc` 후 재시작 |

---

## 개발

<details>
<summary>레포 구조</summary>

```
.claude-plugin/marketplace.json     마켓플레이스 "hsc" (플러그인 hsc 하나)
setup.sh                            설치·예전 설치 정리·제거
plugins/hsc/
├── .claude-plugin/plugin.json      버전, userConfig(Notion 설정 창)
├── commands/                       help · notion-log · digest · setup-review → /hsc:*
├── skills/
│   ├── design-sample-lab/          시안 생성 파이프라인 (SKILL.md, scripts/*.mjs, references/roster.json)
│   ├── find-automation/            세션 분석 (scripts/scan_sessions.py, state.py, references/)
│   └── skill-cleanup/              스킬 집계·정리 (scripts/skillctl.py)
├── hooks/
│   ├── hooks.json                  SessionStart 3개 + UserPromptSubmit 1개
│   └── find_automation_*.py        주기 제안, 반복 표현 힌트
├── lib/                            notion-log·digest 공용 (config, sessions, notion, markdown, mask, common)
├── notion-log/  digest/            수집·기록 스크립트
├── scripts/
│   ├── session-start.js            설정 반영 · 자동 기록 등록 · 어제 기록 알림
│   ├── config.js                   설정 진단 (status · test)
│   └── review-workflow.js          setup-review용 GitHub Actions 워크플로우 생성
├── references/review-prompts.md    스택별 리뷰 프롬프트
├── evals/                          스킬 자동 호출 테스트 질의
└── test/hsc.test.js                node --test (가짜 Notion 서버 사용)
```

</details>

| 하고 싶은 것 | 명령 |
|---|---|
| 수정한 내용을 한 세션만 써 보기 | `claude --plugin-dir=plugins/hsc` |
| clone 폴더를 마켓플레이스로 설치 | `./setup.sh --local` |
| 테스트 | `node --test plugins/hsc/test/hsc.test.js` |
| 매니페스트 검사 | `claude plugin validate . && claude plugin validate plugins/hsc` |
| design-sample-lab 로스터 변경 | `references/roster.json`과 `references/skill-roster.md`를 함께 수정 |

배포할 때는 `plugins/hsc/.claude-plugin/plugin.json`의 `version`을 올려야 설치된 곳에서 업데이트됩니다.
