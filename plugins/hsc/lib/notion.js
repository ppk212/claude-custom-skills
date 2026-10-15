// 최소 Notion REST 클라이언트 (외부 의존성 없음, Node 18+ 내장 fetch)
// - 네트워크 오류·429·5xx는 재시도 (Retry-After 존중)
// - 블록 100개 제한은 여기서 나눠 보낸다
// - 하위 블록 조회는 페이지네이션까지 따라간다
const API = process.env.HSC_NOTION_API || "https://api.notion.com/v1";
const VERSION = "2022-06-28";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 사내 Cloudflare WAF가 본문의 URL을 막는 경우가 있어 요청 본문에서 스킴을 지운다.
const sanitize = (json) => json.replace(/https?:\/\//g, "");

export function createNotion(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Notion-Version": VERSION,
  };

  async function request(method, path, body) {
    const opts = { method, headers };
    if (body !== undefined) opts.body = sanitize(JSON.stringify(body));
    for (let attempt = 1; ; attempt++) {
      let resp;
      try {
        resp = await fetch(`${API}${path}`, opts);
      } catch (e) {
        if (attempt >= 4) throw new Error(`Notion 연결 실패: ${e.message}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (resp.ok) return resp.status === 204 ? {} : resp.json();
      if ((resp.status === 429 || resp.status >= 500) && attempt < 4) {
        const ra = resp.headers.get("retry-after");
        const wait = ra !== null && !Number.isNaN(Number(ra)) ? Number(ra) * 1000 : 1000 * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      const text = (await resp.text()).slice(0, 500);
      throw new Error(`Notion API ${method} ${path} → ${resp.status}: ${text}`);
    }
  }

  async function listChildren(blockId) {
    const out = [];
    let cursor;
    do {
      const q = cursor ? `&start_cursor=${cursor}` : "";
      const r = await request("GET", `/blocks/${blockId}/children?page_size=100${q}`);
      out.push(...(r.results || []));
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    return out;
  }

  async function appendBlocks(blockId, blocks) {
    for (let i = 0; i < blocks.length; i += 100) {
      await request("PATCH", `/blocks/${blockId}/children`, { children: blocks.slice(i, i + 100) });
    }
  }

  return {
    request,
    listChildren,
    appendBlocks,

    async queryDatabase(databaseId, filter) {
      const r = await request("POST", `/databases/${databaseId}/query`, { filter, page_size: 10 });
      return r.results || [];
    },

    async getDatabase(databaseId) {
      return request("GET", `/databases/${databaseId}`);
    },

    // 생성 요청에는 100블록까지만 넣을 수 있어 나머지는 이어 붙인다
    async createPage(parent, properties, blocks = []) {
      const page = await request("POST", "/pages", { parent, properties, children: blocks.slice(0, 100) });
      await appendBlocks(page.id, blocks.slice(100));
      return page;
    },

    async updatePage(pageId, properties) {
      return request("PATCH", `/pages/${pageId}`, { properties });
    },

    // 하위 블록을 모두 지운다 (하위 페이지는 보관함으로 이동)
    async clearChildren(blockId) {
      for (const b of await listChildren(blockId)) {
        try {
          await request("DELETE", `/blocks/${b.id}`);
        } catch (e) {
          console.log(`  ⚠️ 블록 삭제 실패 (무시): ${e.message}`);
        }
      }
    },
  };
}

export const title = (content) => ({ title: [{ text: { content: content.slice(0, 2000) } }] });
