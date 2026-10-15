// 작업 파일 위치, 인자 파싱, Slack 전송 같은 작은 공용 함수
import { existsSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// 대화 원문이 담기는 중간 파일. 사용자 전용 임시 폴더(macOS는 $TMPDIR)에 0700으로 둔다.
export const WORK_DIR = process.env.HSC_WORK_DIR || join(tmpdir(), "hsc");

export function workPath(name) {
  mkdirSync(WORK_DIR, { recursive: true, mode: 0o700 });
  return join(WORK_DIR, name);
}

export function removeQuietly(...paths) {
  for (const p of paths) if (p && existsSync(p)) rmSync(p, { force: true });
}

export function getArg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

export function hasFlag(name) {
  return process.argv.includes(name);
}

export async function postSlack(webhookUrl, payload) {
  if (!webhookUrl) return false;
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error(`⚠️ Slack 알림 실패: ${r.status}`);
    return r.ok;
  } catch (e) {
    console.error(`⚠️ Slack 알림 오류: ${e.message}`);
    return false;
  }
}

// 스크립트 진입점 공통 처리: 예외를 사람이 읽을 수 있게 출력하고 종료 코드 1
export function main(fn) {
  fn().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
