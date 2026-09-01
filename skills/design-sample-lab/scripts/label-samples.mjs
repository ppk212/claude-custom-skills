#!/usr/bin/env node
// Stamps each sample with the skill that produced it, so a sample stays
// identifiable once it leaves the folder — opened on its own, screenshotted,
// or pasted into a deck.
//
//   label-samples.mjs --dir <02-samples dir> [--remove]
//
// Three marks per file, all idempotent and all reversible with --remove:
//   1. a static annotation strip at the top of <body> (never overlays content,
//      so it cannot hide a hero or a sticky CTA the way a fixed badge would)
//   2. a <title> prefix
//   3. an HTML comment above <html>
//
// The strip is deliberately utilitarian — it must read as an annotation added
// by the review process, not as part of the design being judged.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const REMOVE = process.argv.includes('--remove')
const DIR = (p => (isAbsolute(p) ? p : resolve(process.cwd(), p)))(arg('dir', '02-samples'))

const OPEN = '<!--dsl-label-->'
const CLOSE = '<!--/dsl-label-->'
const TITLE_RE = /<title>\s*\[[^\]]*\]\s*/i

function strip({ index, skill, viewport }) {
  const vp = viewport === 'mobile' ? '375px' : '1440px'
  return `${OPEN}<div data-dsl-label style="all:initial;display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;padding:7px 14px;background:#12161C;color:#F2F4F7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.4;letter-spacing:.02em;border-bottom:1px solid #2A313B"><span style="all:unset;font-weight:700;color:#7FA6FF">${index}</span><span style="all:unset;font-weight:600">${skill}</span><span style="all:unset;margin-left:auto;opacity:.6">${vp} · 리디자인 시안</span></div>${CLOSE}`
}

function clean(html) {
  let out = html
  // Strip block, plus the newline apply() puts in front of it — leaving that
  // behind made every re-run add one more blank line after <body>.
  const s = out.indexOf(OPEN)
  const e = out.indexOf(CLOSE)
  if (s !== -1 && e > s) {
    const from = s > 0 && out[s - 1] === '\n' ? s - 1 : s
    out = out.slice(0, from) + out.slice(e + CLOSE.length)
  }
  // title prefix
  out = out.replace(TITLE_RE, '<title>')
  // leading comment
  out = out.replace(/^<!-- design-sample-lab[\s\S]*?-->\n/, '')
  return out
}

function apply(html, meta) {
  let out = clean(html)
  if (REMOVE) return out

  out =
    `<!-- design-sample-lab · 시안 ${meta.index} · 생성 스킬: ${meta.skill} · ${meta.viewport} -->\n` + out

  // <title> prefix — identifies the sample in a browser tab and in bookmarks.
  out = out.replace(/<title>/i, `<title>[${meta.index} ${meta.skill}] `)

  // Strip goes first inside <body> so it occupies layout instead of covering it.
  const m = out.match(/<body[^>]*>/i)
  if (m) {
    const at = out.indexOf(m[0]) + m[0].length
    out = out.slice(0, at) + '\n' + strip(meta) + out.slice(at)
  } else {
    out = strip(meta) + out
  }
  return out
}

if (!existsSync(DIR)) {
  console.error(`FATAL: ${DIR} does not exist`)
  process.exit(1)
}

let touched = 0
for (const name of readdirSync(DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort()) {
  const m = name.match(/^(\d+)-(.+)$/)
  const index = m ? m[1] : '--'
  const skill = m ? m[2] : name
  const done = []
  for (const viewport of ['desktop', 'mobile']) {
    const path = join(DIR, name, `${viewport}.html`)
    if (!existsSync(path)) continue
    const before = readFileSync(path, 'utf8')
    const after = apply(before, { index, skill, viewport })
    if (after !== before) {
      writeFileSync(path, after)
      touched++
      done.push(viewport)
    }
  }
  console.log(`  ${done.length ? '✓' : '·'} ${index} ${skill.padEnd(26)} ${done.join(' ') || '변화 없음'}`)
}
console.log(REMOVE ? `표기 제거: ${touched}개 파일` : `표기 추가: ${touched}개 파일`)
