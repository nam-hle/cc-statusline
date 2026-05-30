/** Tiny synchronous exec helpers — the status line is a print-and-exit hot path. */

import { execSync } from "node:child_process";

/** Run a command, return trimmed stdout, or "" on any failure. */
export function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Run git in `cwd`; "" on failure (e.g. not a repo). */
export function gitIn(cwd: string, args: string): string {
  return sh(`git -C ${JSON.stringify(cwd)} ${args}`);
}
