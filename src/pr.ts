/**
 * PR badge. Number + review_state come live from the Claude Code JSON. Build
 * status is NOT in the JSON, so — only when CC_PR_BUILD_CMD is configured — we
 * read a per-PR cache file (written by a detached run of that command when the
 * cache is stale). The cache only ever feeds the build icon. With no command
 * set, the badge is just PR# + review-state.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename } from "node:path";
import { C, paint } from "./ansi.ts";
import { gitIn } from "./exec.ts";

const CACHE_MAX_AGE_S = 120;

export function buildPrIndicator(
  cwd: string,
  prNumber: string,
  prReviewState: string,
  prBuildCmd: string,
): string {
  if (!prNumber) return "";

  let rsColor: string = C.green;
  let rsGlyph = "";
  switch (prReviewState) {
    case "approved": rsColor = C.green; rsGlyph = "✓"; break;
    case "changes_requested": rsColor = C.red; rsGlyph = "✗"; break;
    case "pending": rsColor = C.yellow; rsGlyph = "·"; break;
    case "draft": rsColor = C.grey; rsGlyph = "◌"; break;
  }
  let indicator = paint(rsColor, `PR#${prNumber}${rsGlyph ? ` ${rsGlyph}` : ""}`);

  if (!prBuildCmd) return indicator; // build status is opt-in

  const repoSlug = basename(gitIn(cwd, "rev-parse --show-toplevel"));
  const cacheFile = `${homedir()}/.cache/cc-statusline/pr-build-${repoSlug}-${prNumber}.json`;
  const nowS = Math.floor(Date.now() / 1000);

  let cachedTime = 0;
  let buildState = "";
  if (existsSync(cacheFile)) {
    try {
      const c = JSON.parse(readFileSync(cacheFile, "utf8")) as { time?: number; build?: string };
      cachedTime = c.time ?? 0;
      buildState = c.build ?? "";
    } catch {
      /* ignore corrupt cache */
    }
  }

  let buildIcon = "";
  if (buildState === "pass") buildIcon = paint(C.green, "✓");
  else if (buildState === "fail") buildIcon = paint(C.red, "✗");
  else if (buildState === "running") buildIcon = paint(C.yellow, "⟳");
  if (buildIcon) indicator += ` ${buildIcon}`;

  // Background refresh when stale — detached, never blocks this render.
  if (nowS - cachedTime >= CACHE_MAX_AGE_S) {
    refreshPrBuildCache(prBuildCmd, repoSlug, prNumber, cacheFile);
  }
  return indicator;
}

function refreshPrBuildCache(
  prBuildCmd: string,
  repoSlug: string,
  pr: string,
  cacheFile: string,
): void {
  // Expand the user's command template, run it detached, classify its JSON
  // ({ failed, inProgress, successful } counts), write the cache.
  const cmd = prBuildCmd.replaceAll("{pr}", pr).replaceAll("{repo}", repoSlug);
  const script = `
    const { execSync } = require("node:child_process");
    const fs = require("node:fs");
    const path = require("node:path");
    let bs = "";
    try {
      const out = execSync(${JSON.stringify(cmd)}, { encoding: "utf8", stdio: ["ignore","pipe","ignore"] });
      const j = JSON.parse(out);
      const d = (j.data && j.data.buildStatus) || j.buildStatus || j;
      if ((d.failed ?? 0) > 0) bs = "fail";
      else if ((d.inProgress ?? 0) > 0) bs = "running";
      else if ((d.successful ?? 0) > 0) bs = "pass";
    } catch {}
    fs.mkdirSync(path.dirname(${JSON.stringify(cacheFile)}), { recursive: true });
    fs.writeFileSync(${JSON.stringify(cacheFile)}, JSON.stringify({ build: bs, time: Math.floor(Date.now()/1000) }));
  `;
  try {
    const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    /* best effort */
  }
}
