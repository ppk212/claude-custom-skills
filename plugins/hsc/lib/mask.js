// Notion·Slack으로 보내기 전에 대화 원문에서 비밀값을 가린다.
// 기록 용도라 커밋 SHA, 페이지 ID 같은 긴 hex는 남긴다. 알려진 토큰 형식과 "키=값" 꼴만 가린다.
const SECRET_WORDS =
  "(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|" +
  "private[_-]?key|client[_-]?secret|authorization|credential|cookie|session[_-]?id)";

const RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "<PRIVATE_KEY>"],
  [/\b(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_|xox[abprs]-|glpat-|AIza|npm_|ntn_|secret_)[A-Za-z0-9_\-]{10,}/g, "<TOKEN>"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "<AWS_KEY>"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "<JWT>"],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 <TOKEN>"],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1<USER>:<PASS>@"],
  [/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g, "hooks.slack.com/services/<MASKED>"],
  [new RegExp(`(["']?[A-Za-z0-9_.-]*${SECRET_WORDS}[A-Za-z0-9_.-]*["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&|)]+)`, "gi"), "$1<MASKED>"],
  [/(--(?:password|passwd|token|secret|api-key|apikey|access-key|client-secret)(?:\s+|=))(\S+)/gi, "$1<MASKED>"],
  [/(비밀번호|비번|패스워드|암호|토큰|시크릿|api ?키)(\s*(?:는|은|가|이|:|=)\s*)(\S+)/gi, "$1$2<MASKED>"],
  [/\b\d{6}-[1-4]\d{6}\b/g, "<RRN>"],
];

export function mask(text) {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}
