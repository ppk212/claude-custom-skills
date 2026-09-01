#!/usr/bin/env node
// Builds index.html — the side-by-side comparison board for a design-sample-lab run.
//
//   build-board.mjs --dir <run folder> [--url <original url>] [--title <name>]
//
// Reads 01-before/ and 02-samples/*/ off disk and renders whatever is actually
// there; a sample missing its mobile shot still gets a card, marked as missing.
// Re-run it any time after regenerating samples — it is pure read-and-render.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, isAbsolute, basename } from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ROOT = isAbsolute(arg('dir', '.')) ? arg('dir', '.') : resolve(process.cwd(), arg('dir', '.'))
const SRC_URL = arg('url', '')
const TITLE = arg('title', basename(ROOT))

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// First real prose in NOTES.md — skips headings, blockquotes, list bullets and
// front matter so the card shows the point rather than the file's scaffolding.
// Inline markdown is stripped: the card renders as HTML, so `**bold**` would
// otherwise show its asterisks.
function noteSummary(dir) {
  const path = join(dir, 'NOTES.md')
  if (!existsSync(path)) return ''
  const lines = readFileSync(path, 'utf8').split('\n')
  const out = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('---') || line.startsWith('>') || line.startsWith('|')) {
      if (out.length) break
      continue
    }
    out.push(line.replace(/^[-*]\s+/, ''))
    if (out.join(' ').length > 200) break
  }
  const text = out
    .join(' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,2}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 220 ? text.slice(0, 219).replace(/\s\S*$/, '') + '…' : text
}

function card({ id, label, sublabel, desktop, mobile, links, summary, tone }) {
  const shot = (src, viewport) =>
    src
      ? `<a class="shot ${viewport}" href="${esc(src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(src)}" alt="${esc(label)} ${viewport}"></a>`
      : `<div class="shot ${viewport} empty">${viewport === 'mobile' ? '모바일' : '데스크톱'} 스크린샷 없음</div>`
  return `
<article class="card${tone ? ' ' + tone : ''}" id="${esc(id)}">
  <header>
    <h2>${esc(label)}</h2>
    ${sublabel ? `<p class="sub">${esc(sublabel)}</p>` : ''}
  </header>
  <div class="shots">${shot(desktop, 'desktop')}${shot(mobile, 'mobile')}</div>
  ${summary ? `<p class="summary">${esc(summary)}</p>` : ''}
  ${links.length ? `<nav>${links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.text)}</a>`).join('')}</nav>` : ''}
</article>`
}

const cards = []

// --- Before ---------------------------------------------------------------
const beforeDir = join(ROOT, '01-before')
if (existsSync(beforeDir)) {
  // Same fold-first rule as the samples, so BEFORE sits at the same scale
  // beside them instead of towering over the row.
  const pick = (...names) => {
    for (const n of names) if (existsSync(join(beforeDir, n))) return `01-before/${n}`
    return null
  }
  const links = []
  if (SRC_URL) links.push({ href: SRC_URL, text: '실제 사이트 열기' })
  if (pick('desktop-1440.png')) links.push({ href: pick('desktop-1440.png'), text: '전체 화면' })
  if (existsSync(join(beforeDir, 'audit.md'))) links.push({ href: '01-before/audit.md', text: 'audit.md' })
  if (existsSync(join(beforeDir, 'audit.json'))) links.push({ href: '01-before/audit.json', text: 'audit.json' })
  cards.push(
    card({
      id: 'before',
      label: 'BEFORE — 현재 STG',
      sublabel: SRC_URL,
      desktop: pick('desktop-fold.png', 'desktop-1440.png'),
      mobile: pick('mobile-fold.png', 'mobile-375.png'),
      links,
      summary: '',
      tone: 'before',
    })
  )
}

// --- Samples --------------------------------------------------------------
const samplesDir = join(ROOT, '02-samples')
let sampleCount = 0
if (existsSync(samplesDir)) {
  const dirs = readdirSync(samplesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
  for (const name of dirs) {
    sampleCount++
    const dir = join(samplesDir, name)
    const rel = (f) => (existsSync(join(dir, f)) ? `02-samples/${name}/${f}` : null)
    // The fold shot is native resolution and readable; the full-page shot is
    // downscaled by the capture tool, so it belongs behind a link.
    const shotFor = (viewport) => rel(`${viewport}-fold.png`) || rel(`${viewport}.png`)
    const links = []
    if (rel('desktop.html')) links.push({ href: rel('desktop.html'), text: 'desktop.html' })
    if (rel('mobile.html')) links.push({ href: rel('mobile.html'), text: 'mobile.html' })
    if (rel('desktop.png')) links.push({ href: rel('desktop.png'), text: '전체 화면' })
    if (rel('NOTES.md')) links.push({ href: rel('NOTES.md'), text: 'NOTES.md' })
    if (rel('DESIGN.md')) links.push({ href: rel('DESIGN.md'), text: 'DESIGN.md' })
    if (rel('TOKENS.md')) links.push({ href: rel('TOKENS.md'), text: 'TOKENS.md' })
    // "01-design-taste-frontend" -> index "01", skill "design-taste-frontend".
    // The folder name IS the provenance, so say so on the card rather than
    // letting the skill name read as a title someone chose.
    const m = name.match(/^(\d+)-(.+)$/)
    cards.push(
      card({
        id: name,
        label: m ? `${m[1]} · ${m[2]}` : name,
        sublabel: `생성 스킬: ${m ? m[2] : name}`,
        desktop: shotFor('desktop'),
        mobile: shotFor('mobile'),
        links,
        summary: noteSummary(dir),
      })
    )
  }
}

const scorecard = existsSync(join(ROOT, '03-review', 'scorecard.md')) ? '03-review/scorecard.md' : null
const brief = existsSync(join(ROOT, '00-brief', 'design-brief.md')) ? '00-brief/design-brief.md' : null
const reqs = existsSync(join(ROOT, '00-brief', 'requirements.md')) ? '00-brief/requirements.md' : null

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)} — 디자인 시안 비교</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f5f3; --panel: #fff; --ink: #17161a; --muted: #6b6a72;
    --line: #e2e0dc; --accent: #2f5fe0; --before: #b45309;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #131317; --panel: #1c1c21; --ink: #eceaf0; --muted: #9a98a4;
            --line: #2e2e36; --accent: #7aa2ff; --before: #e0a955; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", system-ui, sans-serif; }
  header.top { padding: 32px 28px 20px; border-bottom: 1px solid var(--line); }
  header.top h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: -0.01em; }
  header.top .meta { color: var(--muted); font-size: 13px; }
  header.top .meta a { color: var(--accent); }
  .controls { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center;
              flex-wrap: wrap; padding: 12px 28px; background: var(--bg);
              border-bottom: 1px solid var(--line); }
  .controls button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 999px;
                     border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer; }
  .controls button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  .controls .spacer { flex: 1; }
  .controls .doc { font-size: 13px; color: var(--accent); text-decoration: none; }
  main { display: grid; gap: 20px; padding: 24px 28px 64px; align-items: start;
         grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
  body[data-view="mobile"] main { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
          padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .card.before { border-color: var(--before); }
  .card header h2 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.005em; word-break: break-word; }
  .card .sub { margin: 2px 0 0; font-size: 12px; color: var(--muted); word-break: break-all; }
  .shots { display: block; }
  .shot { display: block; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--bg); }
  .shot img { display: block; width: 100%; height: auto; }
  .shot.empty { display: grid; place-items: center; min-height: 140px; color: var(--muted); font-size: 12px; }
  body[data-view="desktop"] .shot.mobile { display: none; }
  body[data-view="mobile"] .shot.desktop { display: none; }
  body[data-view="both"] .shots { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; align-items: start; }
  .summary { margin: 0; font-size: 13px; color: var(--muted); }
  nav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; padding-top: 4px; }
  nav a { font-size: 12px; color: var(--accent); text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  .empty-state { padding: 48px 28px; color: var(--muted); }
</style>
</head>
<body data-view="desktop">
<header class="top">
  <h1>${esc(TITLE)}</h1>
  <p class="meta">
    시안 ${sampleCount}종 · 생성 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
    ${SRC_URL ? ` · 원본 <a href="${esc(SRC_URL)}" target="_blank" rel="noopener">${esc(SRC_URL)}</a>` : ''}
  </p>
</header>

<div class="controls">
  <button data-view="desktop" aria-pressed="true">데스크톱</button>
  <button data-view="mobile" aria-pressed="false">모바일</button>
  <button data-view="both" aria-pressed="false">나란히</button>
  <span class="spacer"></span>
  ${reqs ? `<a class="doc" href="${reqs}">요구사항</a>` : ''}
  ${brief ? `<a class="doc" href="${brief}">디자인 브리프</a>` : ''}
  ${scorecard ? `<a class="doc" href="${scorecard}">스코어카드</a>` : ''}
  <a class="doc" href="README.md">README</a>
</div>

<main>
${cards.join('\n') || '<p class="empty-state">아직 시안이 없습니다. 02-samples/ 를 채운 뒤 다시 실행하세요.</p>'}
</main>

<script>
  const buttons = [...document.querySelectorAll('.controls button')]
  const KEY = 'dsl-view'
  function setView(v) {
    document.body.dataset.view = v
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)))
    try { localStorage.setItem(KEY, v) } catch {}
  }
  buttons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)))
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && buttons.some((b) => b.dataset.view === saved)) setView(saved)
  } catch {}
</script>
</body>
</html>
`

const out = join(ROOT, 'index.html')
writeFileSync(out, html)
console.log(`board: ${out} (${sampleCount} samples${existsSync(beforeDir) ? ' + before' : ''})`)
