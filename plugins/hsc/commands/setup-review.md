---
description: GitHub 레포에 Claude Code Review 워크플로우를 대화형으로 설정
argument-hint: ""
allowed-tools: Bash, Read, Write, Glob, AskUserQuestion
---

# HSC Setup Review — Claude Code Review 워크플로우 자동 설정

GitHub 레포에 Claude Code Review CI 워크플로우를 대화형으로 설정한다.
프로젝트를 분석하고, 맞춤 리뷰 프롬프트를 생성하여 `.github/workflows/claude-code-review.yml`을 자동 생성한다.

---

## 실행 순서

### 1단계: 프로젝트 경로 결정

현재 디렉토리에 `.github/` 폴더가 있는지 확인한다.

```bash
ls -d .github 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"
```

**`.github/` 존재 시:**

현재 디렉토리 이름을 알려주고 질문한다:

```
현재 프로젝트: {현재 디렉토리 이름}
이 프로젝트에 Claude Code Review를 설정할까요? (y/n)
```

- `y` → 현재 디렉토리를 `PROJECT_PATH`로 사용
- `n` → 경로 입력으로 이동

**`.github/` 없음 시:**

```
현재 디렉토리에 .github 폴더가 없습니다.
프로젝트 경로를 입력하세요 (예: ~/Documents/my-project):
```

입력받은 경로의 `~`를 홈 디렉토리로 확장하여 `PROJECT_PATH`로 사용한다.

**경로 검증:**

```bash
ls -d {PROJECT_PATH}/.git 2>/dev/null && echo "GIT_REPO" || echo "NOT_GIT"
```

- `NOT_GIT` → "Git 레포가 아닙니다. 경로를 확인하세요." 출력 후 경로 재입력 요청

### 2단계: 프로젝트 분석

#### 2-1. workflows 디렉토리 확인

```bash
ls -d {PROJECT_PATH}/.github/workflows 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"
```

- `NOT_FOUND` → `.github/workflows/` 디렉토리를 생성한다.

#### 2-2. 기존 Claude 워크플로우 확인

```bash
grep -rl "anthropics/claude-code-action" {PROJECT_PATH}/.github/workflows/ 2>/dev/null
```

기존 파일이 발견되면:

```
⚠️ 기존 Claude 워크플로우가 발견되었습니다:
  - {파일명}
덮어쓸까요? (y/n)
```

- `n` → "설정을 취소합니다." 출력 후 종료

#### 2-3. 언어/프레임워크 자동 감지

아래 파일들을 순서대로 확인하여 자동 감지한다:

```bash
# TypeScript 계열
ls {PROJECT_PATH}/package.json 2>/dev/null && cat {PROJECT_PATH}/package.json
# Python 계열
ls {PROJECT_PATH}/requirements.txt {PROJECT_PATH}/pyproject.toml {PROJECT_PATH}/Pipfile 2>/dev/null
# Go
ls {PROJECT_PATH}/go.mod 2>/dev/null
# Java
ls {PROJECT_PATH}/pom.xml {PROJECT_PATH}/build.gradle 2>/dev/null
```

**감지 로직:**
- `package.json`에 `@nestjs/core` → TypeScript / NestJS
- `package.json`에 `next` → TypeScript / Next.js
- `package.json`에 `react` (next 없음) → TypeScript / React
- `requirements.txt` 또는 `pyproject.toml`에 `fastapi` → Python / FastAPI
- `requirements.txt` 또는 `pyproject.toml`에 `django` → Python / Django
- `go.mod` 존재 → Go
- `pom.xml` 또는 `build.gradle` 존재 → Java / Spring Boot

감지 결과를 `DETECTED_STACK` 변수에 저장한다. 감지 실패 시 `null`.

#### 2-4. 프로젝트 심층 분석 (페르소나 추천용)

프로젝트의 성격을 파악하기 위해 아래 정보를 수집한다:

```bash
# 프로젝트 루트의 README 확인 (있으면 첫 50줄)
head -50 {PROJECT_PATH}/README.md 2>/dev/null

# 디렉토리 구조 파악 (depth 2)
find {PROJECT_PATH} -maxdepth 2 -type d ! -path '*/\.*' ! -path '*/node_modules/*' ! -path '*/build/*' ! -path '*/.gradle/*' | head -30

# 주요 설정 파일 확인
cat {PROJECT_PATH}/build.gradle.kts 2>/dev/null || cat {PROJECT_PATH}/build.gradle 2>/dev/null || cat {PROJECT_PATH}/package.json 2>/dev/null || cat {PROJECT_PATH}/pyproject.toml 2>/dev/null | head -50

# 최근 커밋 메시지로 개발 방향 파악
cd {PROJECT_PATH} && git log --oneline -10 2>/dev/null
```

수집한 정보를 종합하여 `PROJECT_ANALYSIS`를 생성한다. 분석 항목:
- **프로젝트 유형**: 라이브러리, 앱, SDK, CLI, 서비스 등
- **도메인**: 금융, 보안, 교육, 커머스, 인프라 등
- **주요 기술**: 프레임워크, 라이브러리, 아키텍처 패턴
- **개발 단계**: 초기 개발, 활발한 개발, 유지보수 등
- **팀 규모 추정**: 커밋 로그 기반

이 분석 결과를 바탕으로 `RECOMMENDED_PERSONA`를 생성한다.

**페르소나 생성 규칙:**
- 프로젝트 도메인에 맞는 시니어 개발자 역할 부여
- 프로젝트에서 특히 중요한 리뷰 관점 명시 (예: 보안 프로젝트 → 보안 전문가 관점 강조)
- 리뷰 톤과 스타일 포함 (친절하지만 엄격, 핵심 위주 등)
- 2~4문장으로 간결하게 구성

**예시:**
- Android 앱 프로젝트 → "당신은 10년 경력의 시니어 Android 개발자입니다. Kotlin 코루틴, Jetpack Compose, 클린 아키텍처에 전문성을 가지고 있으며, 메모리 누수와 ANR 방지에 특히 주의하여 리뷰합니다. 핵심 이슈에 집중하되, 개선 제안은 구체적인 코드 예시와 함께 제공합니다."
- 보안 라이브러리 → "당신은 보안 전문 시니어 개발자입니다. 암호화 구현, 키 관리, 사이드 채널 공격 방어에 전문성을 가지고 있으며, 보안 취약점을 최우선으로 검토합니다. 잠재적 위험은 심각도와 함께 명확히 지적합니다."
- Next.js SaaS → "당신은 풀스택 시니어 개발자로서 프로덕션 환경의 Next.js 애플리케이션 리뷰를 수행합니다. 서버/클라이언트 경계, 데이터 페칭 패턴, 번들 최적화에 집중하며, 사용자 경험에 영향을 미치는 변경사항을 우선 검토합니다."

### 3단계: 대화형 설정

모든 선택 항목은 **번호 입력 방식**으로 진행한다. AskUserQuestion 도구를 사용한다.

#### 3-1. 프로젝트 언어/프레임워크

`DETECTED_STACK`이 있으면 해당 항목에 `(감지됨)` 표시를 붙인다.

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

- 번호 입력 → 해당 항목 선택
- `8` 선택 시 → "언어/프레임워크를 입력하세요 (예: Rust / Actix):" 추가 질문
- 선택 결과를 `STACK` 변수에 저장

#### 3-2. 모델

```
리뷰에 사용할 Claude 모델을 선택하세요:
1) claude-sonnet-5-5 — 빠르고 경제적 (추천)
2) claude-opus-5-5 — 더 정밀한 리뷰
3) 직접 입력
```

- `3` 선택 시 → "모델명을 입력하세요:" 추가 질문
- 선택 결과를 `MODEL` 변수에 저장

#### 3-3. 리뷰 언어

```
리뷰 결과 언어를 선택하세요:
1) 한국어
2) English
3) 日本語
```

- 선택 결과를 `REVIEW_LANG` 변수에 저장

#### 3-4. API Key Secret 이름

```
GitHub Secrets에 등록할 Anthropic API Key의 Secret 이름을 입력하세요.
(기본값: ANTHROPIC_API_KEY, Enter로 유지)
```

- 입력 없음 → `ANTHROPIC_API_KEY`
- 선택 결과를 `API_KEY_NAME` 변수에 저장

#### 3-5. Label 트리거

```
Label을 이용한 리뷰 재요청 기능을 활성화할까요?
활성화하면 PR에 특정 Label을 붙여서 리뷰를 다시 요청할 수 있습니다. (y/n, 기본값: n)
```

- `y` 선택 시 추가 질문:

```
Label 이름을 입력하세요.
(기본값: Request Claude Code Review, Enter로 유지)
```

- 선택 결과를 `LABEL_ENABLED`(boolean), `LABEL_NAME`(string) 변수에 저장

#### 3-6. Sticky Comment

```
Sticky Comment를 사용할까요?
- y: PR에 리뷰 코멘트를 1개만 유지합니다 (새 push 시 기존 코멘트를 덮어씀)
- n: push할 때마다 새로운 리뷰 코멘트를 추가합니다
(y/n, 기본값: y)
```

- 선택 결과를 `STICKY_COMMENT`(boolean) 변수에 저장

#### 3-7. GitHub 인증 방식

```
Claude Code GitHub App이 레포에 설치되어 있나요?
- y: Claude Code GitHub App 사용 (코멘트가 claude[bot]으로 표시됨)
- n: GitHub Actions 기본 토큰 사용 (코멘트가 github-actions[bot]으로 표시됨)
(y/n, 기본값: y)
```

- `y` → `USE_GITHUB_APP = true`
- `n` → `USE_GITHUB_APP = false`

Claude Code GitHub App이 미설치인 경우 안내:
```
ℹ️ GitHub Actions 기본 토큰을 사용합니다.
  - 리뷰 코멘트가 github-actions[bot]으로 표시됩니다.
  - App 설치를 원하시면: https://github.com/apps/claude
```

#### 3-8. 리뷰어 페르소나

2-4단계에서 생성한 `RECOMMENDED_PERSONA`를 사용자에게 보여주고 확인을 받는다.

```
📋 프로젝트 분석 결과:
  - 유형: {프로젝트 유형}
  - 도메인: {도메인}
  - 주요 기술: {기술 스택}

🤖 추천 리뷰어 페르소나:
  "{RECOMMENDED_PERSONA}"

이 페르소나를 사용할까요?
1) 추천 페르소나 사용
2) 직접 수정
3) 페르소나 없이 진행
```

- `1` → `PERSONA = RECOMMENDED_PERSONA`
- `2` → 사용자가 직접 페르소나 텍스트를 입력. 이때 `RECOMMENDED_PERSONA`를 기반으로 수정할 수 있도록 AskUserQuestion의 description에 추천 내용을 포함한다.
- `3` → `PERSONA = null` (페르소나 미사용)

선택 결과를 `PERSONA` 변수에 저장한다.

### 4단계: 워크플로우 파일 생성

1. `${CLAUDE_PLUGIN_ROOT}/references/review-prompts.md`를 Read로 읽고, `STACK`에 맞는 프롬프트에 `PERSONA`와 리뷰 언어 지시를 넣어 `REVIEW_PROMPT`를 만든다.
2. `REVIEW_PROMPT`를 임시 파일(예: `/tmp/hsc-review-prompt.md`)에 Write로 저장한다.
3. 생성 스크립트로 워크플로우를 만든다. YAML을 직접 쓰지 않는다 (들여쓰기·action 버전 실수를 막기 위해).

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/review-workflow.js" \
  --out "{PROJECT_PATH}/.github/workflows/claude-code-review.yml" \
  --prompt-file /tmp/hsc-review-prompt.md \
  --api-key-name "{API_KEY_NAME}" \
  --model "{MODEL}" \
  --sticky {STICKY_COMMENT} \
  --github-app {USE_GITHUB_APP} \
  [--label "{LABEL_NAME}"]          # LABEL_ENABLED 일 때만
```

생성된 파일 내용을 사용자에게 보여 준다. 스크립트는 `anthropics/claude-code-action@v1`의 `prompt`·`claude_args` 형식으로 쓰고, 인라인 코멘트와 `gh pr comment` 도구만 허용한다.

### 5단계: Label 생성 (LABEL_ENABLED = true 일 때)

`gh` CLI가 설치되어 있는지 확인한다:

```bash
which gh 2>/dev/null && echo "INSTALLED" || echo "NOT_INSTALLED"
```

**설치됨:**

```bash
gh label create "{LABEL_NAME}" --description "Trigger Claude Code Review on PR" --color "d4c5f9" --force 2>&1
```

`--force`를 사용하여 이미 존재하는 경우 업데이트한다.

**미설치:**

```
⚠️ gh CLI가 설치되어 있지 않아 Label을 자동 생성할 수 없습니다.
GitHub 웹에서 직접 생성하세요:
  Settings → Labels → New label
  - Name: {LABEL_NAME}
  - Description: Trigger Claude Code Review on PR
  - Color: #d4c5f9
```

### 6단계: 완료 안내

아래 내용을 출력한다:

```
## ✅ Claude Code Review 워크플로우 설정 완료!

📁 생성된 파일:
  {PROJECT_PATH}/.github/workflows/claude-code-review.yml

⚙️ GitHub에서 추가 설정이 필요합니다:
  Settings → Secrets and variables → Actions
  1. Secret 추가: {API_KEY_NAME} = Anthropic API Key 값
  (모델은 워크플로우에 {MODEL}로 들어 있습니다. 파일 수정 없이 바꾸려면 Variable ANTHROPIC_MODEL을 추가하세요.)

🧪 테스트 방법:
  PR을 하나 열어보세요. Claude가 자동으로 리뷰를 시작합니다.
```

LABEL_ENABLED = true 이면 추가:
```
  🏷️ 리뷰 재요청: PR에 '{LABEL_NAME}' label을 추가하세요.
```

USE_GITHUB_APP = false 이면 추가:
```
  ⚠️ GitHub Actions 기본 토큰을 사용합니다.
     리뷰 코멘트가 github-actions[bot]으로 표시됩니다.
     Claude Code App 설치를 원하시면: https://github.com/apps/claude
```

마지막에 항상 추가:
```
📖 참고: https://github.com/anthropics/claude-code-action
```
