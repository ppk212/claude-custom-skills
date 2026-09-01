#!/usr/bin/env node
// Batch screenshot capture for design-sample-lab, driven by the gstack `browse` daemon.
//
//   capture.mjs before  --url <url> --out <01-before dir>
//   capture.mjs samples --dir <02-samples dir>
//
// `before` captures the live site at three viewports and writes audit.json
// (console errors + the fonts/colors the page actually renders with).
// `samples` walks 02-samples/*/ and shoots desktop.html / mobile.html in place.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const BROWSE =
  process.env.GSTACK_BROWSE ||
  join(homedir(), '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse')

const VIEWPORTS = {
  desktop: { w: 1440, h: 900 },
  tablet: { w: 768, h: 1024 },
  mobile: { w: 375, h: 812 },
}

function browse(args, { quiet = false } = {}) {
  try {
    return execFileSync(BROWSE, args, { encoding: 'utf8', timeout: 120000 }).trim()
  } catch (err) {
    const msg = (err.stdout || '') + (err.stderr || '') || err.message
    if (!quiet) console.error(`  ! browse ${args[0]} failed: ${msg.split('\n')[0]}`)
    return null
  }
}

// Samples commonly gate section visibility on IntersectionObserver. A
// full-page screenshot taken straight after load catches those sections
// mid-reveal — blank bands in the shot that are not blank in the browser.
// Scrolling to the bottom and back forces every observer to fire first.
// `browse eval` does NOT await a returned Promise — an async script is
// silently dropped. Every step below must therefore be synchronous, with the
// waiting done here in Node between separate browse calls (the daemon keeps
// page state across them).
const sleep = s => { try { execFileSync('sleep', [String(s)]) } catch {} }

// Step 3, synchronous. Reveal-gated sections are unhidden two ways: first by
// adding the classes IO handlers normally add (keeps the design's intended end
// state), then by brute force for whatever is still invisible.
const REVEAL_SCRIPT = `(function () {
  var kill = document.createElement('style')
  kill.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;animation-fill-mode:both!important}'
  document.head.appendChild(kill)

  var ACTIVE = ['in', 'in-view', 'inview', 'is-visible', 'visible', 'shown', 'show', 'active', 'revealed', 'animate', 'loaded']
  var SEL = '[class*="reveal"],[class*="fade"],[class*="appear"],[class*="slide-"],[class*="rise"],[data-reveal],[data-animate],[data-aos]'
  var tagged = 0
  Array.prototype.forEach.call(document.querySelectorAll(SEL), function (el) {
    ACTIVE.forEach(function (c) { el.classList.add(c) })
    el.removeAttribute('data-reveal')
    tagged++
  })

  var forced = 0
  Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
    var s = getComputedStyle(el)
    if (s.position === 'fixed' || s.position === 'sticky') return
    if (s.display === 'none') return
    if (!(parseFloat(s.opacity) < 0.05 || s.visibility === 'hidden')) return
    el.style.setProperty('opacity', '1', 'important')
    el.style.setProperty('visibility', 'visible', 'important')
    el.style.setProperty('transform', 'none', 'important')
    el.style.setProperty('filter', 'none', 'important')
    el.style.setProperty('clip-path', 'none', 'important')
    forced++
  })
  return JSON.stringify({ tagged: tagged, forced: forced, height: document.documentElement.scrollHeight })
})()`

function settleReveals() {
  // 1. Walk the page so real IntersectionObservers fire on their own.
  const steps = browse(['js', 'Math.ceil(document.documentElement.scrollHeight / (window.innerHeight*0.75))'], { quiet: true })
  const n = Math.min(Math.max(Number((steps || '').match(/\d+/)?.[0] || 6), 1), 24)
  for (let i = 0; i <= n; i++) {
    browse(['js', `window.scrollTo(0, window.innerHeight*0.75*${i})`], { quiet: true })
    sleep(0.12)
  }
  browse(['js', 'window.scrollTo(0, document.documentElement.scrollHeight)'], { quiet: true })
  sleep(0.5)
  browse(['js', 'window.scrollTo(0,0)'], { quiet: true })
  sleep(0.4)

  // 2. Then unhide anything the observers missed in headless.
  const tmp = join(tmpdir(), `dsl-reveal-${process.pid}.js`)
  writeFileSync(tmp, REVEAL_SCRIPT)
  const raw = browse(['eval', tmp], { quiet: true })
  rmSync(tmp, { force: true })
  sleep(0.35)
  return {
    tagged: Number((raw || '').match(/"tagged":\s*(\d+)/)?.[1] || 0),
    forced: Number((raw || '').match(/"forced":\s*(\d+)/)?.[1] || 0),
  }
}

function shoot(url, outPath, viewport, { reload = true } = {}) {
  const { w, h } = VIEWPORTS[viewport]
  browse(['viewport', `${w}x${h}`])
  if (reload) {
    browse(['reload'], { quiet: true })
    browse(['wait', '--networkidle'], { quiet: true })
  }
  const { tagged, forced } = settleReveals()
  const res = browse(['screenshot', outPath])
  const ok = res !== null && existsSync(outPath)
  const note = tagged || forced ? ` (reveal 활성 ${tagged} / 강제 ${forced})` : ''
  console.log(`  ${ok ? '✓' : '✗'} ${viewport.padEnd(7)} ${outPath}${note}`)
  return ok
}

// Runs in the page. Counts what the live DOM actually renders with, so the
// redesign brief argues against real values rather than what the CSS claims.
const AUDIT_SCRIPT = `(() => {
  const els = Array.from(document.querySelectorAll('body *')).slice(0, 4000)
  const tally = (fn) => {
    const m = new Map()
    for (const el of els) {
      const v = fn(el)
      if (!v || v === 'none' || v === 'rgba(0, 0, 0, 0)') continue
      m.set(v, (m.get(v) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([value, count]) => ({ value, count }))
  }
  const cs = (el) => getComputedStyle(el)
  const headings = ['h1','h2','h3','h4'].map((t) => {
    const el = document.querySelector(t)
    if (!el) return null
    const s = cs(el)
    return { tag: t, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight }
  }).filter(Boolean)
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || null,
    lang: document.documentElement.lang || null,
    elementCount: document.querySelectorAll('*').length,
    fontFamilies: tally((el) => cs(el).fontFamily),
    textColors: tally((el) => (el.textContent || '').trim() ? cs(el).color : null),
    backgrounds: tally((el) => cs(el).backgroundColor),
    borderRadii: tally((el) => cs(el).borderRadius),
    boxShadows: tally((el) => cs(el).boxShadow),
    headings,
    imageCount: document.images.length,
    imagesMissingAlt: [...document.images].filter((i) => !i.alt).length,
    buttonCount: document.querySelectorAll('button, [role=button], a.btn').length,
  }
})()`

function audit(outDir) {
  const tmp = join(tmpdir(), `dsl-audit-${process.pid}.js`)
  writeFileSync(tmp, AUDIT_SCRIPT)
  const raw = browse(['eval', tmp])
  rmSync(tmp, { force: true })

  let data = null
  if (raw) {
    // `browse eval` prints the value; find the JSON object inside whatever it framed it with.
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        data = JSON.parse(raw.slice(start, end + 1))
      } catch {
        data = { parseError: true, raw: raw.slice(0, 2000) }
      }
    }
  }

  const errors = browse(['console', '--errors'], { quiet: true })
  const out = { capturedAt: new Date().toISOString(), consoleErrors: errors || '', ...(data || {}) }
  const path = join(outDir, 'audit.json')
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(`  ✓ audit   ${path}`)
  return out
}

function abs(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p)
}

function fileUrl(p) {
  return `file://${abs(p)}`
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function captureBefore() {
  const url = arg('url')
  const outDir = abs(arg('out', '01-before'))
  if (!url) {
    console.error('capture.mjs before --url <url> --out <dir>')
    process.exit(2)
  }
  mkdirSync(outDir, { recursive: true })
  console.log(`before: ${url}`)

  if (browse(['goto', url]) === null) {
    console.error(`FATAL: could not load ${url}`)
    process.exit(1)
  }

  let ok = 0
  for (const [name, { w }] of Object.entries(VIEWPORTS)) {
    if (shoot(url, join(outDir, `${name}-${w}.png`), name)) ok++
  }
  audit(outDir)
  console.log(`before: ${ok}/3 viewports captured`)
  if (ok === 0) process.exit(1)
}

// `browse screenshot` (full page) caps output height around 2000px and
// downscales the WHOLE image to fit — a 1440x8400 page lands as 342x2000,
// far too small to read. `--viewport` is never rescaled, so a tall viewport
// gives native pixels. Folds are the readable evidence; the full-page shot
// stays as the structural overview.
const FOLDS = {
  desktop: { w: 1440, h: 1600 },
  mobile: { w: 375, h: 1400 },
}

function captureFolds() {
  const dir = abs(arg('dir', '02-samples'))
  if (!existsSync(dir)) {
    console.error(`FATAL: ${dir} does not exist`)
    process.exit(1)
  }
  const sampleDirs = readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()

  let shot = 0
  for (const name of sampleDirs) {
    console.log(name)
    for (const [viewport, { w, h }] of Object.entries(FOLDS)) {
      const html = join(dir, name, `${viewport}.html`)
      if (!existsSync(html)) {
        console.log(`  - ${viewport.padEnd(7)} (no ${viewport}.html)`)
        continue
      }
      const out = join(dir, name, `${viewport}-fold.png`)
      browse(['viewport', `${w}x${h}`])
      browse(['goto', fileUrl(html)])
      browse(['wait', '--load'], { quiet: true })
      settleReveals()
      browse(['js', 'window.scrollTo(0,0)'], { quiet: true })
      sleep(0.3)
      const res = browse(['screenshot', '--viewport', out])
      const ok = res !== null && existsSync(out)
      if (ok) shot++
      console.log(`  ${ok ? '✓' : '✗'} ${viewport.padEnd(7)} ${w}x${h} native  ${out}`)
    }
  }
  console.log(`folds: ${shot} native captures across ${sampleDirs.length} sample dirs`)
  if (shot === 0) process.exit(1)
}

function captureSamples() {
  const dir = abs(arg('dir', '02-samples'))
  if (!existsSync(dir)) {
    console.error(`FATAL: ${dir} does not exist`)
    process.exit(1)
  }
  const sampleDirs = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  let shot = 0
  let missing = []
  for (const name of sampleDirs) {
    console.log(name)
    for (const viewport of ['desktop', 'mobile']) {
      const html = join(dir, name, `${viewport}.html`)
      if (!existsSync(html)) {
        missing.push(`${name}/${viewport}.html`)
        console.log(`  - ${viewport.padEnd(7)} (no ${viewport}.html)`)
        continue
      }
      browse(['goto', fileUrl(html)])
      if (shoot(fileUrl(html), join(dir, name, `${viewport}.png`), viewport)) shot++
    }
  }
  console.log(`samples: ${shot} screenshots across ${sampleDirs.length} sample dirs`)
  if (missing.length) console.log(`missing HTML: ${missing.join(', ')}`)
  if (shot === 0) process.exit(1)
}

const mode = process.argv[2]
if (mode === 'before') captureBefore()
else if (mode === 'samples') captureSamples()
else if (mode === 'folds') captureFolds()
else {
  console.error('usage: capture.mjs before  --url <url> --out <dir>')
  console.error('       capture.mjs samples --dir <02-samples dir>   full-page overview (downscaled)')
  console.error('       capture.mjs folds   --dir <02-samples dir>   native-resolution first screen')
  process.exit(2)
}
