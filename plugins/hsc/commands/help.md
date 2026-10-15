---
description: claude-custom-skills 레포의 모든 스킬 사용법을 언어별로 안내 (ko/en/jp)
argument-hint: "[ko|en|jp]"
allowed-tools: ""
---

# HSC Skills Help

인자(`$ARGUMENTS`)에 따라 언어를 선택한다.
- `ko` 또는 인자 없음 → 한국어 (기본값)
- `en` → English
- `jp` → 日本語

아래 내용을 선택된 언어로 출력한다.

---

## 한국어 (ko)

```
# 🛠️ HSC (Hyper Session Commands) 스킬 목록

## /hsc:setting [check|reset]
HSC 스킬에 필요한 환경변수를 대화형으로 설정합니다.

- **인자 없음**: 설정 모드 (새로 설정 또는 변경)
- **check**: 현재 설정 상태만 확인
- **reset**: 설정 초기화 후 재설정

**설정 항목:**
- Notion API Key (필수)
- Daily DB ID — `/hsc:notion-log` 일별 기록용 (필수)
- Topic DB ID — `/hsc:notion-log` 주제별 기록용 (필수)
- Digest DB ID — `/hsc:digest` 종합 문서용 (필수)
- Slack Webhook URL (선택)

**활용 예시:**
- `/hsc:setting` → 대화형으로 설정 진행
- `/hsc:setting check` → 현재 설정 상태 확인
- `/hsc:setting reset` → 전체 설정 초기화

---

## /hsc:notion-log [YYYY-MM-DD]
Claude Code 세션을 Notion에 기록합니다.

- **인자 없음**: 오늘 날짜의 세션을 기록
- **날짜 지정**: 해당 날짜의 세션을 기록 (예: `/hsc:notion-log 2026-03-23`)

**동작 순서:**
1. 지정 날짜의 모든 Claude Code 세션 수집
2. 세션 내용 분석 → 요약/주제 추출
3. Notion 일별 DB에 페이지 생성 + 주제별 DB에 태그 포함 기록

**활용 예시:**
- 하루 작업 끝나고 `/hsc:notion-log` → 오늘 작업 자동 정리
- 과거 날짜 기록 누락 시 `/hsc:notion-log 2026-03-20` → 소급 기록

---

## /hsc:digest <주제>
과거 모든 세션에서 특정 주제 관련 대화를 검색하여 Notion 종합 문서를 생성합니다.

- **필수 인자**: 검색할 주제 (한글/영어 모두 가능)

**동작 순서:**
1. 모든 프로젝트의 전체 세션 히스토리에서 주제 관련 대화 검색
2. 관련 대화를 시간순으로 종합 분석
3. Notion 주제별 DB에 코드/쿼리/설정값 포함한 상세 문서 생성

**활용 예시:**
- `/hsc:digest Prisma` → Prisma 관련 모든 작업 이력 종합
- `/hsc:digest 인증 시스템` → 인증 관련 작업 내역 문서화
- `/hsc:digest Kubernetes 배포` → K8s 배포 관련 지식 정리

---

## /hsc:setup-review
GitHub 레포에 Claude Code Review 워크플로우를 대화형으로 설정합니다.

**동작 순서:**
1. 프로젝트 경로 확인 (현재 디렉토리 또는 직접 입력)
2. 프로젝트 분석 (언어/프레임워크 자동 감지, 기존 워크플로우 충돌 확인)
3. 대화형 설정 (모델, 리뷰 언어, Label 트리거, Sticky Comment 등)
4. `.github/workflows/claude-code-review.yml` 자동 생성
5. GitHub Secrets/Variables 설정 안내

**주요 기능:**
- 프로젝트 언어/프레임워크에 맞춘 리뷰 프롬프트 자동 생성
- PR 생성 시 자동 리뷰 + Label을 통한 리뷰 재요청 (선택)
- 7개 언어/프레임워크 지원 + 직접 입력

**활용 예시:**
- `/hsc:setup-review` → 대화형으로 Claude Code Review 설정

---

## 같은 마켓플레이스의 다른 플러그인 (설치했을 때만)
- `/skill-cleanup` — 안 쓰는·겹치는 스킬 정리
- `/design-sample-lab <URL> <요구사항.md>` — 리디자인 시안 일괄 생성
- `/find-automation [기간] [프로젝트]` — 반복 작업을 찾아 자동화
```

---

## English (en)

```
# 🛠️ HSC (Hyper Session Commands) Skills

## /hsc:setting [check|reset]
Interactively configure environment variables required for HSC skills.

- **No argument**: Setup mode (new or modify)
- **check**: View current configuration status
- **reset**: Clear and reconfigure all settings

**Configuration items:**
- Notion API Key (required)
- Daily DB ID — for `/hsc:notion-log` daily records (required)
- Topic DB ID — for `/hsc:notion-log` topic records (required)
- Digest DB ID — for `/hsc:digest` documents (required)
- Slack Webhook URL (optional)

**Examples:**
- `/hsc:setting` → Interactive setup
- `/hsc:setting check` → Check current status
- `/hsc:setting reset` → Reset all settings

---

## /hsc:notion-log [YYYY-MM-DD]
Log Claude Code sessions to Notion.

- **No argument**: Logs today's sessions
- **With date**: Logs sessions for the specified date (e.g., `/hsc:notion-log 2026-03-23`)

**How it works:**
1. Collects all Claude Code sessions for the target date
2. Analyzes session content → extracts summary and topics
3. Creates a page in Notion daily DB + records topics with tags

**Examples:**
- `/hsc:notion-log` → Auto-summarize today's work at end of day
- `/hsc:notion-log 2026-03-20` → Backfill a missed date

---

## /hsc:digest <topic>
Search all past sessions for a specific topic and generate a comprehensive Notion document.

- **Required argument**: Topic to search (Korean or English)

**How it works:**
1. Searches all session histories across all projects for the topic
2. Chronologically synthesizes related conversations
3. Creates a detailed document in Notion topic DB (includes code, queries, configs)

**Examples:**
- `/hsc:digest Prisma` → Consolidate all Prisma-related work history
- `/hsc:digest auth system` → Document all authentication work
- `/hsc:digest Kubernetes deployment` → Organize K8s deployment knowledge

---

## /hsc:setup-review
Interactively set up Claude Code Review workflow for a GitHub repository.

**How it works:**
1. Determine project path (current directory or manual input)
2. Analyze project (auto-detect language/framework, check existing workflows)
3. Interactive setup (model, review language, label trigger, sticky comment, etc.)
4. Auto-generate `.github/workflows/claude-code-review.yml`
5. Guide GitHub Secrets/Variables configuration

**Key features:**
- Auto-generates review prompts tailored to project language/framework
- Auto review on PR creation + optional label-based re-review
- Supports 7 language/framework presets + custom input

**Example:**
- `/hsc:setup-review` → Interactively set up Claude Code Review
```

---

## 日本語 (jp)

```
# 🛠️ HSC (Hyper Session Commands) スキル一覧

## /hsc:setting [check|reset]
HSCスキルに必要な環境変数を対話形式で設定します。

- **引数なし**: 設定モード（新規または変更）
- **check**: 現在の設定状態を確認
- **reset**: 設定を初期化して再設定

**設定項目:**
- Notion API Key（必須）
- Daily DB ID — `/hsc:notion-log` 日別記録用（必須）
- Topic DB ID — `/hsc:notion-log` トピック別記録用（必須）
- Digest DB ID — `/hsc:digest` 総合ドキュメント用（必須）
- Slack Webhook URL（任意）

**使用例:**
- `/hsc:setting` → 対話形式で設定
- `/hsc:setting check` → 現在の設定確認
- `/hsc:setting reset` → 全設定を初期化

---

## /hsc:notion-log [YYYY-MM-DD]
Claude CodeセッションをNotionに記録します。

- **引数なし**: 今日のセッションを記録
- **日付指定**: 指定日のセッションを記録（例: `/hsc:notion-log 2026-03-23`）

**動作手順:**
1. 対象日の全Claude Codeセッションを収集
2. セッション内容を分析 → サマリー・トピック抽出
3. Notion日別DBにページ作成 + トピック別DBにタグ付き記録

**使用例:**
- `/hsc:notion-log` → 一日の終わりに作業を自動整理
- `/hsc:notion-log 2026-03-20` → 過去の記録漏れを補完

---

## /hsc:digest <トピック>
過去の全セッションから特定トピックの会話を検索し、Notionに総合ドキュメントを生成します。

- **必須引数**: 検索するトピック（日本語・英語対応）

**動作手順:**
1. 全プロジェクトの全セッション履歴からトピック関連の会話を検索
2. 関連する会話を時系列で総合分析
3. NotionトピックDBにコード・クエリ・設定値を含む詳細ドキュメントを作成

**使用例:**
- `/hsc:digest Prisma` → Prisma関連の全作業履歴を統合
- `/hsc:digest 認証システム` → 認証関連の作業をドキュメント化
- `/hsc:digest Kubernetesデプロイ` → K8sデプロイの知識を整理

---

## /hsc:setup-review
GitHubリポジトリにClaude Code Reviewワークフローを対話形式で設定します。

**動作手順:**
1. プロジェクトパス確認（カレントディレクトリまたは手動入力）
2. プロジェクト分析（言語/フレームワーク自動検出、既存ワークフロー競合確認）
3. 対話形式設定（モデル、レビュー言語、Labelトリガー、Sticky Comment等）
4. `.github/workflows/claude-code-review.yml` 自動生成
5. GitHub Secrets/Variables設定ガイド

**主な機能:**
- プロジェクトの言語/フレームワークに合わせたレビュープロンプト自動生成
- PR作成時の自動レビュー + Labelによるレビュー再要求（オプション）
- 7言語/フレームワークプリセット + カスタム入力対応

**使用例:**
- `/hsc:setup-review` → 対話形式でClaude Code Reviewを設定
```
