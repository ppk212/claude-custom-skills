#!/usr/bin/env node
// Reports what this machine can and cannot run, before a long fan-out wastes
// an hour discovering it. Every dependency is optional in a different way —
// a missing capture tool degrades the run, a missing roster skill just drops
// one sample — so this prints tiers, never a single pass/fail.
//
//   doctor.mjs            사람이 읽는 리포트
//   doctor.mjs --json     기계 판독용
//   doctor.mjs --quiet    설치 안내 없이 요약만

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROSTER = JSON.parse(readFileSync(join(HERE, '..', 'references', 'roster.json'), 'utf8'))
const HOME = homedir()
const JSON_OUT = process.argv.includes('--json')
const QUIET = process.argv.includes('--quiet')

const has = cmd => {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// A skill is usable if it sits in ~/.claude/skills or inside any installed
// plugin's cache. Built-ins can't be probed from disk, so they're reported
// as "확인 불가" rather than missing.
const skillsDir = join(HOME, '.claude', 'skills')
const localSkills = new Set(existsSync(skillsDir) ? readdirSync(skillsDir) : [])

const pluginSkills = new Set()
const cacheDir = join(HOME, '.claude', 'plugins', 'cache')
;(function walk(dir, depth = 0) {
  if (depth > 8 || !existsSync(dir)) return
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name === 'skills') {
      for (const s of readdirSync(join(dir, e.name), { withFileTypes: true })) {
        if (s.isDirectory() && existsSync(join(dir, e.name, s.name, 'SKILL.md'))) pluginSkills.add(s.name)
      }
    }
    walk(join(dir, e.name), depth + 1)
  }
})(cacheDir)

function skillState(qualified, source) {
  // Plugin skills are invoked as "plugin:skill" but sit on disk under the bare name.
  const name = qualified.split(':').pop()
  if (source === 'builtin') return { ok: true, where: '내장' }
  if (localSkills.has(name)) return { ok: true, where: '~/.claude/skills' }
  if (pluginSkills.has(name)) return { ok: true, where: '플러그인' }
  return { ok: false, where: '없음' }
}

// --- tier 1: the run cannot start without these ----------------------------
const nodeMajor = Number(process.versions.node.split('.')[0])
const core = [
  { name: `Node.js ${process.versions.node}`, ok: nodeMajor >= 18, fix: 'Node.js 18 이상 설치' },
]

// --- tier 2: capture -------------------------------------------------------
const browsePath =
  process.env.GSTACK_BROWSE ||
  [
    join(HOME, '.local', 'share', 'gstack', 'browse', 'dist', 'browse'),
    join(HOME, '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse'),
  ].find(p => existsSync(p)) ||
  join(HOME, '.local', 'share', 'gstack', 'browse', 'dist', 'browse')
const browseOk = existsSync(browsePath)
const capture = [
  { name: 'gstack browse (권장 캡처 경로)', ok: browseOk, fix: ROSTER.sources.gstack.install },
  { name: 'sips (캔버스 썸네일, macOS 전용)', ok: has('sips'), fix: 'macOS 기본 제공. 다른 OS는 캔버스 단계를 건너뛴다' },
]

// --- tier 3: roster --------------------------------------------------------
const sampleRows = ROSTER.samples.map(s => ({ ...s, ...skillState(s.skill, s.source) }))
const sharedRows = ROSTER.shared.map(s => ({ ...s, ...skillState(s.skill, s.source) }))
const imagegenKey =
  Boolean(process.env.OPENAI_API_KEY) || existsSync(join(HOME, '.gstack', 'openai.json'))
const condRows = ROSTER.conditional.samples.map(s => ({ ...s, ...skillState(s.skill, s.source) }))

const runnable = sampleRows.filter(r => r.ok).length
const missingSources = new Set()
for (const r of [...sampleRows, ...sharedRows]) {
  if (!r.ok && r.source?.startsWith('plugin:')) missingSources.add(r.source.slice(7))
  else if (!r.ok) missingSources.add('taste-skill')
}

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        node: process.versions.node,
        browse: browseOk ? browsePath : null,
        sips: has('sips'),
        imagegenKey,
        samples: sampleRows.map(({ n, skill, ok, where }) => ({ n, skill, ok, where })),
        shared: sharedRows.map(({ skill, ok, where }) => ({ skill, ok, where })),
        conditional: condRows.map(({ n, skill, ok }) => ({ n, skill, ok, enabled: ok && imagegenKey })),
        runnableSamples: runnable,
        missingSources: [...missingSources],
      },
      null,
      2
    )
  )
  process.exit(core.every(c => c.ok) ? 0 : 1)
}

const mark = ok => (ok ? '✅' : '❌')
const line = (l, v) => console.log(`  ${l.padEnd(42)} ${v}`)

console.log('\ndesign-sample-lab — 환경 점검\n')

console.log('■ 필수')
for (const c of core) line(c.name, mark(c.ok))

console.log('\n■ 캡처')
for (const c of capture) line(c.name, mark(c.ok))
if (!browseOk) {
  console.log('    → browse가 없으면 스크린샷을 Playwright MCP로 대체해야 한다.')
  console.log('      둘 다 없으면 시안 HTML은 만들어지지만 캡처·비교 보드 이미지가 비어 있다.')
}

console.log(`\n■ 시안 생성 스킬 (${runnable}/${sampleRows.length})`)
for (const r of sampleRows) line(`${r.n} ${r.skill}`, `${mark(r.ok)} ${r.where}`)

const sharedOk = sharedRows.filter(r => r.ok).length
console.log(`\n■ 공통 적용 스킬 (${sharedOk}/${sharedRows.length})`)
for (const r of sharedRows) line(r.skill, `${mark(r.ok)} ${r.where}`)

console.log(`\n■ 이미지 생성 계열 (OpenAI 키 ${imagegenKey ? '있음' : '없음'})`)
for (const r of condRows) line(`${r.n} ${r.skill}`, `${mark(r.ok && imagegenKey)} ${r.ok ? r.where : '없음'}`)

console.log('\n■ 판정')
if (!core.every(c => c.ok)) {
  console.log('  실행 불가 — 위 필수 항목을 먼저 해결하라.')
} else if (runnable === 0) {
  console.log('  시안 생성 스킬이 하나도 없다. 아래 설치 안내를 따르라.')
} else {
  console.log(`  실행 가능. 시안 ${runnable}종이 생성된다${browseOk ? '' : ' (캡처는 대체 경로 필요)'}.`)
  if (runnable < sampleRows.length) console.log(`  없는 스킬 ${sampleRows.length - runnable}종은 자동으로 건너뛴다.`)
}

if (!QUIET && missingSources.size) {
  console.log('\n■ 없는 스킬 설치 방법')
  for (const key of missingSources) {
    const src = ROSTER.sources[key]
    if (!src) continue
    console.log(`\n  [${key}]`)
    console.log(`    ${src.install}`)
    if (src.hint) console.log(`    ↑ ${src.hint}`)
  }
  console.log('\n  플러그인 설치 후에는 Claude Code를 재시작해야 스킬이 등록된다.')
  console.log('  재시작 없이 쓰려면 플러그인 캐시의 skills/<이름> 폴더를 ~/.claude/skills/ 로 복사하라.')
}
console.log('')
process.exit(core.every(c => c.ok) && runnable > 0 ? 0 : 1)
