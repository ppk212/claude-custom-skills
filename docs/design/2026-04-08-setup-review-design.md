# /hsc:setup-review 설계 문서

## 개요

GitHub 레포에 Claude Code Review 워크플로우를 대화형으로 설정하는 스킬.
프로젝트 언어/프레임워크를 감지하고, 맞춤 리뷰 프롬프트를 생성하여 `.github/workflows/claude-code-review.yml`을 자동 생성한다.

## 구현 방식

순수 스킬 (.md 파일) — 기존 `hsc:setting`, `hsc:help` 패턴과 동일.

## 스킬 흐름

### 1단계: 프로젝트 경로 결정

- 현재 디렉토리에 `.github/` 존재 → "현재 프로젝트({디렉토리명})에 설정할까요? (y/n)"
  - y → 현재 디렉토리 사용
  - n → 경로 입력으로 이동
- `.github/` 없음 → "프로젝트 경로를 입력하세요"
- 경로 입력 시 `~` 확장 지원 (예: `~/Documents/supertone-workspaces/gadget`)
- 입력된 경로가 git 레포인지 검증 (`.git/` 존재 확인)

### 2단계: 프로젝트 분석

- `.github/workflows/` 디렉토리 존재 여부 확인 (없으면 생성)
- 기존 `claude-code-review.yml` 또는 유사 Claude 워크플로우 파일 존재 시 → "이미 Claude 리뷰 워크플로우가 존재합니다. 덮어쓸까요? (y/n)"
- `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` 등으로 언어/프레임워크 자동 감지 → 3단계 선택지 기본값으로 활용

### 3단계: 대화형 설정

모든 선택 항목은 번호 입력 방식. AskUserQuestion 도구 사용.

#### 3-1. 프로젝트 언어/프레임워크

자동 감지 결과가 있으면 해당 항목에 `(감지됨)` 표시.

```
프로젝트 언어/프레임워크를 선택하세요:
1) TypeScript / NestJS
2) TypeScript / Next.js
3) TypeScript / React
4) Python / FastAPI
5) Python / Django
6) Go
7) Java / Spring Boot
8) 직접 입력
```

#### 3-2. 모델

```
리뷰에 사용할 Claude 모델을 선택하세요:
1) claude-sonnet-4-20250514 — 빠르고 경제적
2) claude-opus-4-20250514 — 더 정밀한 리뷰
3) 직접 입력
```

#### 3-3. 리뷰 언어

```
리뷰 결과 언어를 선택하세요:
1) 한국어
2) English
3) 日本語
```

#### 3-4. API Key Secret 이름

```
GitHub Secrets에 등록한 Anthropic API Key의 이름을 입력하세요.
(기본값: ANTHROPIC_API_KEY, Enter로 유지)
```

#### 3-5. Label 트리거 (선택)

```
Label을 이용한 리뷰 재요청 기능을 활성화할까요?
활성화하면 PR에 특정 Label을 붙여서 리뷰를 다시 요청할 수 있습니다.
(y/n, 기본값: n)
```

y 선택 시:
```
Label 이름을 입력하세요.
(기본값: Request Claude Code Review, Enter로 유지)
```

#### 3-6. Sticky Comment (선택)

```
Sticky Comment를 사용할까요?
- y: PR에 리뷰 코멘트를 1개만 유지합니다 (새 push 시 기존 코멘트를 덮어씀)
- n: push할 때마다 새로운 리뷰 코멘트를 추가합니다
(y/n, 기본값: y)
```

### 4단계: 워크플로우 생성

`{프로젝트경로}/.github/workflows/claude-code-review.yml` 파일 생성.

#### 기본 구조

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened]  # label 활성화 시 [opened, labeled]

jobs:
  claude-review:
    if: (github.event.action == 'opened')
    # label 활성화 시 조건 확장

    runs-on: ubuntu-latest

    permissions:
      contents: read
      pull-requests: write
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Claude Code Review
        uses: anthropics/claude-code-action@beta
        timeout-minutes: 10
        with:
          anthropic_api_key: ${{ secrets.{API_KEY_NAME} }}
          model: ${{ vars.ANTHROPIC_MODEL }}
          direct_prompt: |
            {맞춤 리뷰 프롬프트}
          use_sticky_comment: {true/false}

      # label 활성화 시 label 제거 step 추가
```

#### 맞춤 리뷰 프롬프트 템플릿

언어/프레임워크별로 분석 항목이 달라짐:

**TypeScript / NestJS:**
```
이 풀 리퀘스트를 분석해주세요:

**아키텍처 분석:**
- NestJS 레이어드 아키텍처 준수 여부 (presentation/application/domain/infrastructure)
- 모듈 구조 및 DI 패턴 적절성
- 변경사항이 전체 아키텍처에 미치는 영향

**코드 품질:**
- TypeScript 타입 안전성 및 인터페이스 설계
- 에러 핸들링 및 예외 처리
- 코드 중복 및 리팩토링 필요성

**보안 및 성능:**
- 잠재적 보안 취약점 (SQL injection, XSS 등)
- 성능 병목 가능성
- 의존성 변경 영향

{리뷰 언어 지시}
```

**TypeScript / Next.js:**
```
이 풀 리퀘스트를 분석해주세요:

**아키텍처 분석:**
- App Router / Pages Router 패턴 준수
- 서버/클라이언트 컴포넌트 분리 적절성
- 데이터 페칭 패턴 및 캐싱 전략

**코드 품질:**
- TypeScript 타입 안전성
- 컴포넌트 재사용성 및 구조
- 에러 바운더리 및 로딩 상태 처리

**보안 및 성능:**
- 번들 사이즈 영향
- Core Web Vitals 관련 이슈
- 서버 사이드 보안

{리뷰 언어 지시}
```

**TypeScript / React:**
```
이 풀 리퀘스트를 분석해주세요:

**아키텍처 분석:**
- 컴포넌트 구조 및 책임 분리
- 상태 관리 패턴 적절성
- 데이터 흐름 및 props 설계

**코드 품질:**
- TypeScript 타입 안전성
- Hook 사용 패턴 및 의존성 배열
- 컴포넌트 재사용성

**보안 및 성능:**
- 불필요한 리렌더링
- 메모이제이션 적절성
- XSS 방지

{리뷰 언어 지시}
```

**Python / FastAPI:**
```
이 풀 리퀘스트를 분석해주세요:

**아키텍처 분석:**
- API 엔드포인트 설계 및 RESTful 패턴
- 의존성 주입 패턴 적절성
- 비동기 처리 패턴

**코드 품질:**
- 타입 힌트 및 Pydantic 모델 검증
- 에러 핸들링 및 HTTP 상태 코드
- 코드 구조 및 모듈화

**보안 및 성능:**
- 입력 검증 및 SQL injection 방지
- 인증/인가 처리
- 비동기 성능 최적화

{리뷰 언어 지시}
```

**Python / Django:**
```
이 풀 리퀘스트를 분석해주세요:

**아키텍처 분석:**
- MTV 패턴 준수 여부
- ORM 쿼리 효율성
- URL 라우팅 및 뷰 구조

**코드 품질:**
- Django 컨벤션 및 베스트 프랙티스
- 모델 설계 및 마이그레이션
- 폼/시리얼라이저 검증

**보안 및 성능:**
- CSRF, XSS, SQL injection 방지
- N+1 쿼리 문제
- 캐싱 전략

{리뷰 언어 지시}
```

**Go:**
```
이 풀 리퀘스트를 분석해주세요:

**아키텍처 분석:**
- 패키지 구조 및 의존성 방향
- 인터페이스 설계 및 추상화 수준
- 동시성 패턴 적절성

**코드 품질:**
- 에러 핸들링 (error wrapping, sentinel errors)
- Go 관용적 표현 준수
- 테스트 가능한 구조

**보안 및 성능:**
- goroutine 누수 가능성
- 메모리 관리 및 GC 영향
- 입력 검증

{리뷰 언어 지시}
```

**Java / Spring Boot:**
```
이 풀 리퀘스트를 분석해주세요:

**아키텍처 분석:**
- 레이어드 아키텍처 준수 (Controller/Service/Repository)
- Spring Bean 생명주기 및 DI 패턴
- 트랜잭션 관리

**코드 품질:**
- SOLID 원칙 준수
- 예외 처리 전략
- DTO/Entity 분리

**보안 및 성능:**
- Spring Security 설정
- SQL injection, CSRF 방지
- JPA N+1 쿼리 및 지연 로딩

{리뷰 언어 지시}
```

**직접 입력 시:** 입력받은 언어/프레임워크 이름을 프롬프트에 포함하되, 공통 분석 항목(아키텍처, 코드 품질, 보안/성능)으로 구성.

#### 리뷰 언어 지시

- 한국어: `최종 리뷰 결과를 한국어로 작성해주세요.`
- English: `Please write the review in English.`
- 日本語: `レビュー結果を日本語で記述してください。`

### 5단계: Label 생성 (선택 시)

Label 트리거 활성화한 경우:

```bash
gh label create "{입력한 Label 이름}" \
  --description "Trigger Claude Code Review on PR" \
  --color "d4c5f9" \
  --repo {현재 레포의 owner/repo}
```

실행 전 확인:
- `gh` CLI 설치 여부 확인
- 미설치 시 → 수동 생성 안내 메시지 출력
- 이미 동일 이름 label 존재 시 → 건너뛰고 안내

### 6단계: 완료 안내

```
## ✅ Claude Code Review 워크플로우 설정 완료!

📁 생성된 파일:
  {프로젝트경로}/.github/workflows/claude-code-review.yml

⚙️ GitHub에서 추가 설정이 필요합니다:
  1. Settings → Secrets and variables → Actions
     - Secret 추가: {API_KEY_NAME} = Anthropic API Key
     - Variable 추가: ANTHROPIC_MODEL = {선택한 모델}

🧪 테스트 방법:
  PR을 하나 열어보세요. Claude가 자동으로 리뷰를 시작합니다.
  {label 활성화 시: "또는 PR에 '{Label 이름}' label을 추가하세요."}

📖 참고:
  - anthropics/claude-code-action: https://github.com/anthropics/claude-code-action
```

## 파일 구조

```
skills/
└── setup-review/
    └── claude-commands/
        └── hsc:setup-review.md
```

## 허용 도구

```
Bash, Read, Write, Glob, AskUserQuestion
```

## 인자

없음 (모든 설정은 대화형으로 진행)
