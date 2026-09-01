#!/usr/bin/env node
// Mechanical gate on generated samples, before any human looks at them.
//
//   validate-samples.mjs --dir <02-samples dir> [--ids R1,R2,...]
//
// Catches the failures that make a sample worthless but are invisible in a
// screenshot: truncated HTML, external image URLs that render as blank on
// file://, dummy copy, a NOTES.md missing requirement IDs, and type/spacing
// token counts that violate R4/R5. Exit 1 if any sample has a FAIL.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DIR = (p => (isAbsolute(p) ? p : resolve(process.cwd(), p)))(arg('dir', '02-samples'))
const IDS = arg('ids', 'R1,R2,R3,R4,R5,C1,C2').split(',').map(s => s.trim()).filter(Boolean)

const checks = {
  // [label, test(html) -> true when the problem is present, severity]
  truncated: [
    'HTML 잘림 / 생략 주석',
    h => /<!--[^>]{0,40}(나머지|생략|동일|same as|rest of|TODO|기존과)/i.test(h) || !/<\/html>\s*$/i.test(h.trim()),
    'FAIL',
  ],
  externalImg: [
    '외부 이미지 URL',
    h => /<img[^>]+src\s*=\s*["']https?:\/\//i.test(h) ||
         /url\(\s*["']?https?:\/\/(?!fonts\.g)/i.test(h),
    'FAIL',
  ],
  dummyCopy: [
    'lorem ipsum / 영문 더미',
    h => /lorem\s+ipsum|dolor\s+sit\s+amet/i.test(h),
    'FAIL',
  ],
  noTitle: ['<title> 없음', h => !/<title>\s*\S/.test(h), 'FAIL'],
  noViewport: ['viewport meta 없음', h => !/name=["']viewport["']/i.test(h), 'FAIL'],
  noLangKo: ['lang="ko" 없음', h => !/<html[^>]+lang=["']ko["']/i.test(h), 'WARN'],
  extCss: ['외부 CSS 링크', h => /<link[^>]+rel=["']stylesheet["'][^>]+href=["'](?!https:\/\/fonts\.googleapis)/i.test(h), 'FAIL'],
  noFallbackFont: [
    'Google Font에 fallback 스택 없음',
    // A generic family anywhere in the sheet is enough — the stack is often
    // declared once on a :root var and referenced by var() everywhere else.
    h => /fonts\.googleapis\.com/.test(h) &&
         !/(sans-serif|serif|system-ui|-apple-system|monospace)/i.test(h),
    'WARN',
  ],
  multipleH1: ['h1이 2개 이상', h => (h.match(/<h1[\s>]/gi) || []).length > 1, 'WARN'],
  noH1: ['h1 없음', h => !/<h1[\s>]/i.test(h), 'FAIL'],
}

// R4's real question is "how many distinct font sizes does this page render",
// not "how are the variables named". So resolve :root vars, then count the
// distinct values every font-size declaration actually resolves to — px, rem,
// clamp() and var() alike.
function tokenCounts(html) {
  const root = (html.match(/:root\s*\{([\s\S]*?)\}/) || [, ''])[1]
  const vars = new Map(
    [...root.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(m => [m[1], m[2].trim()])
  )
  const isType = n => /(^|-)(fs|font|text|type|step|h[1-6]|title|body|caption|display|scale)(-|$)/i.test(n)
  // Anchored at the start so `--s-4` counts as spacing while `--r-s` (radius)
  // and `--fs-4` (type) do not.
  const isSpace = n => /^(s|sp|space|spacing|gap|stack|gutter|pad|inset|rhythm|section|sec)(-|$)/i.test(n)

  const resolve1 = v => v.replace(/var\(\s*--([a-z0-9-]+)\s*(?:,[^)]*)?\)/gi, (_, n) => vars.get(n) ?? _)
  const deep = v => { let o = v; for (let i = 0; i < 4; i++) { const n = resolve1(o); if (n === o) break; o = n } return o }

  const declared = [...html.matchAll(/font-size:\s*([^;}]+)[;}]/gi)].map(m => deep(m[1].trim()).replace(/\s+/g, ''))
  const distinctFontSizes = new Set(declared.filter(v => v && !/^inherit$|^unset$/i.test(v)))

  const typeVars = [...vars.keys()].filter(isType)
  const spaceVarEntries = [...vars.entries()].filter(([n]) => isSpace(n))
  const badSpace = spaceVarEntries
    .map(([n, v]) => [n, deep(v)])
    .filter(([, v]) => /^[\d.]+px$/.test(v) && Number(v.replace('px', '')) % 4 !== 0)
    .map(([n, v]) => `${n}:${v}`)

  return {
    typeVars: typeVars.length,
    spaceVars: spaceVarEntries.length,
    distinctFontSizes: distinctFontSizes.size,
    badSpace,
  }
}

const dirs = existsSync(DIR)
  ? readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  : []

if (!dirs.length) {
  console.log(`(아직 시안 폴더가 없다: ${DIR})`)
  process.exit(0)
}

let anyFail = false
for (const name of dirs) {
  const dir = join(DIR, name)
  const problems = []

  for (const viewport of ['desktop', 'mobile']) {
    const path = join(dir, `${viewport}.html`)
    if (!existsSync(path)) {
      problems.push(`FAIL  ${viewport}.html 없음`)
      continue
    }
    const html = readFileSync(path, 'utf8')
    const kb = (html.length / 1024).toFixed(0)
    for (const [key, [label, test, sev]] of Object.entries(checks)) {
      if (test(html)) problems.push(`${sev}  ${viewport}: ${label}`)
    }
    const t = tokenCounts(html)
    // R4 is judged on rendered distinct sizes, not on variable naming.
    if (t.distinctFontSizes > 9) problems.push(`FAIL  ${viewport}: 서로 다른 font-size ${t.distinctFontSizes}종 > 9 (R4)`)
    else if (t.distinctFontSizes > 7) problems.push(`WARN  ${viewport}: 서로 다른 font-size ${t.distinctFontSizes}종 (목표 7 이하, R4)`)
    if (t.typeVars === 0 && t.distinctFontSizes > 0)
      problems.push(`WARN  ${viewport}: :root에 타입 스케일 변수가 안 보임 (R4는 CSS 변수 선언을 요구)`)
    if (t.spaceVars === 0) problems.push(`WARN  ${viewport}: :root에 간격 변수 없음 (R5)`)
    if (t.badSpace.length) problems.push(`FAIL  ${viewport}: 4px 배수 아닌 간격 토큰 ${t.badSpace.join(', ')} (R5)`)
    problems.push(`info  ${viewport}: ${kb}KB · font-size ${t.distinctFontSizes}종 · 타입변수 ${t.typeVars} · 간격변수 ${t.spaceVars}`)
  }

  const notes = join(dir, 'NOTES.md')
  if (!existsSync(notes)) problems.push('FAIL  NOTES.md 없음')
  else {
    const n = readFileSync(notes, 'utf8')
    const missing = IDS.filter(id => !new RegExp(`\\|\\s*\\*{0,2}${id}\\*{0,2}\\s*\\|`).test(n))
    if (missing.length) problems.push(`FAIL  NOTES.md 요구사항 표에 누락: ${missing.join(', ')}`)
  }

  const fails = problems.filter(p => p.startsWith('FAIL'))
  if (fails.length) anyFail = true
  console.log(`\n${fails.length ? '✗' : '✓'} ${name}`)
  for (const p of problems) console.log(`   ${p}`)
}

console.log(`\n${anyFail ? 'FAIL 있음 — 해당 시안 재생성 필요' : '전부 통과'}`)
process.exit(anyFail ? 1 : 0)
