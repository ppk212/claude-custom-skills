// ~/.claude-<name>/.env 를 읽어 process.env 에 채운다 (이미 있는 값은 덮어쓰지 않음).
// 플러그인 폴더는 업데이트 때마다 새로 받으므로 설정은 플러그인 밖에 둔다.
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export function loadEnv(name) {
  const file = process.env.HSC_ENV_FILE || join(homedir(), `.claude-${name}`, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
