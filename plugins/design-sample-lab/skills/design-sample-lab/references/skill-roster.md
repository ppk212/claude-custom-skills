# 시안 생성 스킬 로스터

이 파일이 **어떤 스킬이 몇 번 시안을 만드는지의 단일 출처**다. 스킬을 늘리거나
줄이려면 SKILL.md가 아니라 이 표를 고친다.

각 행이 서브에이전트 1개 = 시안 폴더 1개 = `desktop.html` + `mobile.html` 1쌍이다.

## 기본 로스터 (11종, 외부 키 불필요)

| # | 폴더명 | 실행할 스킬 | 이 스킬만의 결 | 추가 입력 |
|---|---|---|---|---|
| 01 | `01-design-taste-frontend` | `design-taste-frontend` | 브리프에서 방향을 스스로 추론하는 anti-slop v2. 템플릿 느낌 제거가 최우선 | — |
| 02 | `02-design-taste-frontend-v1` | `design-taste-frontend-v1` | v2 이전의 원본 규칙. v2보다 보수적이고 예측 가능 | — |
| 03 | `03-gpt-taste` | `gpt-taste` | AIDA 구조 + 와이드 에디토리얼 타이포 + GSAP ScrollTrigger 모션 | — |
| 04 | `04-minimalist-ui` | `minimalist-ui` | 웜 모노크롬, 플랫 벤토 그리드. 그라디언트·무거운 그림자 금지 | — |
| 05 | `05-industrial-brutalist-ui` | `industrial-brutalist-ui` | 스위스 활자 + 밀리터리 터미널. 극단적 타입 스케일 대비, 경직된 그리드 | — |
| 06 | `06-high-end-visual-design` | `high-end-visual-design` | 고급 에이전시 톤. 폰트·여백·그림자·카드 구조를 "비싸 보이게" 하는 규칙 | — |
| 07 | `07-stitch-design-taste` | `stitch-design-taste` | 먼저 `DESIGN.md`(시맨틱 디자인 시스템)를 뽑고 그걸로 구현. 폴더에 `DESIGN.md`도 남긴다 | — |
| 08 | `08-frontend-design` | `frontend-design:frontend-design` (Anthropic 공식 플러그인) | 공식 가드레일. Inter/Roboto 등 남용 폰트 차단, 미감 방향 명시 강제 | — |
| 09 | `09-interface-design` | `interface-design:interface-design` | 디자인 토큰 일관성 우선. 폴더에 토큰 정의도 남긴다 | — |
| 10 | `10-image-to-code` | `image-to-code` | **Before 스크린샷을 직접 보고** 재해석. 유일하게 현재 화면을 시각 입력으로 받는다 | `01-before/desktop-1440.png`, `mobile-375.png` |
| 11 | `11-claude-design-canvas` | 내장 `design` | 캔버스 아트보드 관용구(넓은 여백, 그리드 정렬, 뚜렷한 섹션 경계)로 작성 | — |

> **11번 주의.** `design` 스킬의 본래 산출물은 `.dc.html` 아트보드다. Phase 3에서는
> 그 시각 언어만 빌려 쓰고 **파일명은 다른 시안과 똑같이 `desktop.html` /
> `mobile.html`로 낸다.** `.dc.html`을 만드는 건 Phase 5의 집계 캔버스
> (`canvas/samples.dc.html`) 한 번뿐이고, Artifact 발행도 거기서만 한다.

## 모든 시안에 공통 적용 (별도 폴더 없음)

플러그인 스킬은 **`플러그인:스킬` 형태로 invoke한다** (예: `Skill(visual-critique:critique-color)`).
`Skill(design-systems)`처럼 플러그인 이름만 쓰면 실패한다. 아래가 실제로 invoke 가능한 이름이다.

| 스킬 | 적용 지점 |
|---|---|
| `redesign-existing-projects` | Phase 1. 현재 사이트의 제네릭 AI 패턴을 감사해 `audit.md` 작성 |
| `full-output-enforcement` | Phase 3. 각 서브에이전트가 HTML을 `<!-- ... -->` 플레이스홀더 없이 끝까지 쓰게 강제 |
| `design-systems:design-token` `ui-design:typography-scale` `ui-design:spacing-system` `ui-design:layout-grid` `ui-design:color-system` `ui-design:responsive-design` | Phase 2. 공통 브리프의 토큰·타입 스케일·그리드·브레이크포인트 정의 (designer-skills) |
| `impeccable:impeccable` | Phase 5. `/impeccable audit`으로 시안별 안티패턴 점수 |
| `visual-critique:critique-visual-hierarchy` `visual-critique:critique-typography` `visual-critique:critique-color` `visual-critique:critique-composition` `visual-critique:critique-brand-consistency` | Phase 5. 시안별 시각 비평 (designer-skills) |
| `design-systems:accessibility-audit` | Phase 5. 대비·시맨틱 점검 (designer-skills) |
| `design-review` (스킬 아님 — **에이전트**) | Phase 5. `Agent(subagent_type: "design-review")`로 호출. WCAG AA + 반응형 라이브 검증 |

Phase 2·5에서 위 목록을 전부 invoke할 필요는 없다. 필요한 것만 고른다 — 기본값은
Phase 2에서 `design-systems:design-token` + `ui-design:typography-scale` + `ui-design:layout-grid`,
Phase 5에서 `visual-critique:critique-visual-hierarchy` + `visual-critique:critique-typography` + `visual-critique:critique-color`.

## 조건부 로스터 (OpenAI 키가 있을 때만)

`~/.gstack/openai.json` 또는 `$OPENAI_API_KEY`가 있으면 아래 4종을 로스터 뒤에
자동으로 이어붙인다. 없으면 **조용히 건너뛰지 말고** README에 "키 없음으로 제외"라고 남긴다.

| # | 폴더명 | 실행할 스킬 | 산출물 |
|---|---|---|---|
| 12 | `12-imagegen-frontend-web` | `imagegen-frontend-web` | 섹션별 웹 레퍼런스 이미지 (섹션 1개당 이미지 1장) |
| 13 | `13-imagegen-frontend-mobile` | `imagegen-frontend-mobile` | 폰 목업 안의 앱 화면 이미지 |
| 14 | `14-brandkit` | `brandkit` | 브랜드 가이드라인 보드 |
| 15 | `15-design-shotgun` | `gstack-design-shotgun` | 이미지 변형 4~6종 + 비교 보드 |

키 존재 확인:

```bash
[ -f ~/.gstack/openai.json ] || [ -n "$OPENAI_API_KEY" ] && echo IMAGEGEN_AVAILABLE || echo IMAGEGEN_SKIPPED
```

12~15번은 HTML이 아니라 PNG를 만든다. 폴더에 `desktop.html`/`mobile.html`이
없으므로 비교 보드에는 "스크린샷 없음" 카드로 뜬다. 대신 생성된 PNG를 각각
`desktop.png` / `mobile.png`로 복사해 두면 보드에 정상 표시된다.

## 로스터를 줄이는 경우

- 사용자가 `--skills a,b,c`로 지정 → 해당 행만 실행
- `design-taste-frontend`와 `-v1`은 결과가 겹칠 수 있다. 사용자가 중복을 지적하면
  02번을 먼저 뺀다.
- 요구사항 md가 특정 미감을 못 박은 경우(예: "브루탈리즘 절대 안 됨") 충돌하는 행을
  빼고 **README에 뺀 이유를 적는다**. 조용히 빼지 않는다.
