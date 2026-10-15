// Claude Code Review GitHub Actions 워크플로우 생성 (anthropics/claude-code-action@v1)
//   node review-workflow.js --out <path> --prompt-file <md> [--api-key-name ANTHROPIC_API_KEY]
//        [--model claude-sonnet-5-5] [--sticky true|false] [--github-app true|false] [--label "이름"]
// 조합마다 YAML을 손으로 쓰던 것을 한 곳에서 만든다.
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { getArg } from "../lib/common.js";

const out = getArg("--out");
const promptFile = getArg("--prompt-file");
if (!out || !promptFile) {
  console.error("Usage: node review-workflow.js --out <path> --prompt-file <md> [--api-key-name X] [--model M] [--sticky true|false] [--github-app true|false] [--label NAME]");
  process.exit(1);
}
const apiKeyName = getArg("--api-key-name", "ANTHROPIC_API_KEY");
const model = getArg("--model", "claude-sonnet-5-5");
const sticky = getArg("--sticky", "true") !== "false";
const githubApp = getArg("--github-app", "true") !== "false";
const label = getArg("--label");

if (!/^[A-Z_][A-Z0-9_]*$/.test(apiKeyName)) {
  console.error(`❌ Secret 이름은 대문자·숫자·_ 만 됩니다: ${apiKeyName}`);
  process.exit(1);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`; // YAML/표현식 작은따옴표 이스케이프
const indent = (text, n) => text.split("\n").map((l) => (l ? " ".repeat(n) + l : "")).join("\n");

const reviewPrompt = readFileSync(promptFile, "utf-8").trim();
const prompt = [
  "REPO: ${{ github.repository }}",
  "PR NUMBER: ${{ github.event.pull_request.number }}",
  "",
  reviewPrompt,
  "",
  "구체적인 문제는 해당 줄에 인라인 코멘트(mcp__github_inline_comment__create_inline_comment)로 남기고,",
  "전체 요약은 `gh pr comment`로 하나의 코멘트로 남긴다.",
].join("\n");

const allowedTools = [
  "mcp__github_inline_comment__create_inline_comment",
  "Bash(gh pr comment:*)",
  "Bash(gh pr diff:*)",
  "Bash(gh pr view:*)",
].join(",");

const lines = [];
lines.push("name: Claude Code Review", "", "on:", "  pull_request:");
lines.push(`    types: [${label ? "opened, ready_for_review, labeled" : "opened, ready_for_review"}]`, "");
lines.push("jobs:", "  claude-review:");
if (label) {
  lines.push(
    "    if: |",
    "      github.event.action != 'labeled' ||",
    `      github.event.label.name == ${q(label)}`,
  );
}
lines.push("    runs-on: ubuntu-latest", "    timeout-minutes: 15", "    permissions:");
lines.push("      contents: read", "      pull-requests: write", "      issues: write");
if (githubApp) lines.push("      id-token: write");
lines.push("", "    steps:");
lines.push("      - uses: actions/checkout@v5", "        with:", "          fetch-depth: 1", "");
lines.push("      - name: Claude Code Review", "        uses: anthropics/claude-code-action@v1", "        with:");
lines.push(`          anthropic_api_key: \${{ secrets.${apiKeyName} }}`);
if (!githubApp) lines.push("          github_token: ${{ secrets.GITHUB_TOKEN }}");
lines.push(`          use_sticky_comment: ${sticky}`);
lines.push("          prompt: |", indent(prompt, 12));
lines.push("          claude_args: |");
lines.push(`            --model \${{ vars.ANTHROPIC_MODEL || ${q(model)} }}`);
lines.push(`            --allowedTools "${allowedTools}"`);
if (label) {
  lines.push(
    "",
    "      - name: Remove review label",
    `        if: always() && github.event.action == 'labeled'`,
    "        env:",
    "          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    `          LABEL: ${q(label)}`,
    '        run: gh pr edit ${{ github.event.pull_request.number }} --repo ${{ github.repository }} --remove-label "$LABEL"',
  );
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n");
console.log(`✅ ${out}`);
