// 마크다운 → Notion 블록. notion-log와 digest가 같이 쓴다.
// 지원: # ## ### 제목, - * 목록(2단계 중첩), 1. 번호 목록, > 인용, ``` 코드, ---, 문단,
//       인라인 `코드`·**굵게**, 목록 항목 앞의 "(자동)" 회색 표시
const MAX_TEXT = 1900; // Notion rich_text 한 조각 제한 2000자
const MAX_RICH = 100; // rich_text 배열 최대 길이

const LANGS = {
  js: "javascript", javascript: "javascript", ts: "typescript", typescript: "typescript",
  py: "python", python: "python", sh: "shell", bash: "shell", zsh: "shell", shell: "shell",
  sql: "sql", json: "json", yaml: "yaml", yml: "yaml", go: "go", java: "java", kotlin: "kotlin",
  rust: "rust", html: "html", css: "css", diff: "diff", dockerfile: "docker", docker: "docker",
  md: "markdown", markdown: "markdown", xml: "xml", ruby: "ruby", php: "php", swift: "swift",
};

export function splitText(text, max = MAX_TEXT) {
  if (!text) return [""];
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  out.push(rest);
  return out;
}

const seg = (content, annotations) => ({ type: "text", text: { content }, ...(annotations ? { annotations } : {}) });

// 인라인 `코드`, **굵게** 만 해석한다. 나머지는 그대로 텍스트.
export function richText(text, { plain = false } = {}) {
  const parts = [];
  const push = (content, ann) => {
    for (const piece of splitText(content)) if (piece) parts.push(seg(piece, ann));
  };
  if (plain) push(text);
  else {
    const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) push(text.slice(last, m.index));
      if (m[1] !== undefined) push(m[1], { code: true });
      else push(m[2], { bold: true });
      last = re.lastIndex;
    }
    if (last < text.length) push(text.slice(last));
  }
  if (!parts.length) parts.push(seg(""));
  if (parts.length > MAX_RICH) {
    // 너무 잘게 쪼개졌으면 서식을 버리고 다시 나눈다
    return richText(parts.map((p) => p.text.content).join(""), { plain: true }).slice(0, MAX_RICH);
  }
  return parts;
}

function listItemRich(text) {
  const m = text.match(/^\(자동\)\s*/);
  if (!m) return richText(text);
  return [seg("(자동) ", { color: "gray" }), ...richText(text.slice(m[0].length))];
}

const block = (type, body) => ({ object: "block", type, [type]: body });

export function markdownToBlocks(md) {
  const blocks = [];
  const lines = (md || "").split("\n");
  let lastTop = null; // 중첩 목록을 붙일 상위 항목

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      const language = LANGS[fence[1].toLowerCase()] || "plain text";
      blocks.push(block("code", { rich_text: richText(code.join("\n"), { plain: true }), language }));
      lastTop = null;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push(block(`heading_${h[1].length}`, { rich_text: richText(h[2]) }));
      lastTop = null;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(block("divider", {}));
      lastTop = null;
      continue;
    }

    const li = line.match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/);
    if (li) {
      const type = /\d/.test(li[2]) ? "numbered_list_item" : "bulleted_list_item";
      const item = block(type, { rich_text: listItemRich(li[3]) });
      if (li[1].length >= 2 && lastTop) {
        const body = lastTop[lastTop.type];
        (body.children ||= []).push(item);
      } else {
        blocks.push(item);
        lastTop = item;
      }
      continue;
    }

    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      blocks.push(block("quote", { rich_text: richText(q[1]) }));
      lastTop = null;
      continue;
    }
    if (line.trim()) {
      blocks.push(block("paragraph", { rich_text: richText(line) }));
    }
    lastTop = null;
  }
  // 한 항목의 하위 목록도 100개 제한
  for (const b of blocks) {
    const body = b[b.type];
    if (body?.children?.length > 100) body.children = body.children.slice(0, 100);
  }
  return blocks;
}

export { block, seg };
