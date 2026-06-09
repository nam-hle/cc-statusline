/**
 * PR badge. Two sources, in priority order:
 *
 * 1. The Claude Code session JSON (GitHub-native): PR number + review_state
 *    arrive live; build status is not in the JSON, so — only when
 *    CC_PR_BUILD_CMD is set — we read a per-PR cache file (written by a detached
 *    run of that command) for the build icon.
 *
 * 2. Bitbucket: the JSON has nothing. When CC_PR_FETCH_CMD is set we read
 *    a per-branch cache file holding the discovered PR number, aggregated review
 *    state, and build status — all written by a single detached run of the
 *    fetch command. The render itself stays synchronous and never blocks.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename } from "node:path";
import { C, paint } from "./ansi.ts";
import { gitIn } from "./exec.ts";

const CACHE_MAX_AGE_S = 60;

export function buildPrIndicator(
  cwd: string,
  prNumber: string,
  prReviewState: string,
  prBuildCmd: string,
  prFetchCmd: string,
): string {
  // Source 2: discover the PR from a per-branch fetch cache when the session
  // JSON gave us nothing and a fetch command is configured.
  if (!prNumber && prFetchCmd) {
    const fetched = readFetchCache(cwd, prFetchCmd);
    if (!fetched.pr) return "";
    // The PR list command never populates buildStatus; only `pr view` does. So resolve
    // the build via prBuildCmd against the discovered id (cached per PR).
    const build = prBuildCmd ? readBuildCache(cwd, fetched.pr, prBuildCmd) : "";
    return renderBadge(fetched.pr, fetched.review, build);
  }

  if (!prNumber) return "";

  // Source 1: GitHub-native PR# + review state from the session JSON.
  let buildState = "";
  if (prBuildCmd) {
    buildState = readBuildCache(cwd, prNumber, prBuildCmd);
  }
  return renderBadge(prNumber, prReviewState, buildState);
}

/** Render #<n> (color = build state) + colored review glyph. */
function renderBadge(prNumber: string, prReviewState: string, buildState: string): string {
  // #number color carries build state: green pass, red fail, yellow running/none.
  let numColor: string = C.yellow;
  if (buildState === "pass") numColor = C.green;
  else if (buildState === "fail") numColor = C.red;
  let indicator = paint(numColor, `#${prNumber}`);

  let rsColor: string = C.green;
  let rsGlyph = "";
  switch (prReviewState) {
    case "approved": rsColor = C.green; rsGlyph = "✓"; break;
    case "changes_requested": rsColor = C.red; rsGlyph = "✗"; break;
    case "pending": rsColor = C.yellow; rsGlyph = "◌"; break;
  }
  if (rsGlyph) indicator += ` ${paint(rsColor, rsGlyph)}`;

  return indicator;
}

/** Read the per-PR build cache; refresh detached when stale. */
function readBuildCache(cwd: string, prNumber: string, prBuildCmd: string): string {
  const repoSlug = basename(gitIn(cwd, "rev-parse --show-toplevel"));
  const cacheFile = `${homedir()}/.cache/cc-statusline/pr-build-${repoSlug}-${prNumber}.json`;

  const c = readCache(cacheFile) as { time?: number; build?: string };
  const buildState = c.build ?? "";

  if (isStale(c.time)) {
    const cmd = prBuildCmd.replaceAll("{pr}", prNumber).replaceAll("{repo}", repoSlug);
    runDetached(buildClassifyScript(cmd, cacheFile));
  }
  return buildState;
}

/** Read the per-branch fetch cache; refresh detached when stale. */
function readFetchCache(
  cwd: string,
  prFetchCmd: string,
): { pr: string; review: string; build: string } {
  const branch = gitIn(cwd, "rev-parse --abbrev-ref HEAD");
  if (!branch) return { pr: "", review: "", build: "" };

  const repoSlug = basename(gitIn(cwd, "rev-parse --show-toplevel"));
  const safeBranch = branch.replaceAll("/", "-");
  const cacheFile = `${homedir()}/.cache/cc-statusline/pr-fetch-${repoSlug}-${safeBranch}.json`;

  const c = readCache(cacheFile) as { time?: number; pr?: string; review?: string; build?: string };

  if (isStale(c.time)) {
    const cmd = prFetchCmd.replaceAll("{branch}", branch).replaceAll("{repo}", repoSlug);
    runDetached(fetchClassifyScript(cmd, cacheFile, cwd));
  }
  return { pr: c.pr ?? "", review: c.review ?? "", build: c.build ?? "" };
}

function readCache(cacheFile: string): Record<string, unknown> {
  if (!existsSync(cacheFile)) return {};
  try {
    return JSON.parse(readFileSync(cacheFile, "utf8")) as Record<string, unknown>;
  } catch {
    return {}; // corrupt cache → treat as empty (and stale)
  }
}

function isStale(time: number | undefined): boolean {
  const nowS = Math.floor(Date.now() / 1000);
  return nowS - (time ?? 0) >= CACHE_MAX_AGE_S;
}

function runDetached(script: string): void {
  try {
    const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    /* best effort */
  }
}

/** Classify { failed, inProgress, successful } counts into pass/fail/running. */
function buildClassifyScript(cmd: string, cacheFile: string): string {
  return `
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
}

/**
 * Parse a PR-list JSON (Bitbucket PR list shape), pick the first PR, aggregate its
 * reviewers into a GitHub-like review state, and classify its build status.
 */
function fetchClassifyScript(cmd: string, cacheFile: string, cwd: string): string {
  return `
    const { execSync } = require("node:child_process");
    const fs = require("node:fs");
    const path = require("node:path");
    let pr = "", review = "", build = "";
    try {
      const out = execSync(${JSON.stringify(cmd)}, { cwd: ${JSON.stringify(cwd)}, encoding: "utf8", stdio: ["ignore","pipe","ignore"] });
      const j = JSON.parse(out);
      const list = Array.isArray(j) ? j : (j.data ?? []);
      const p = Array.isArray(list) ? list[0] : list;
      if (p && p.id != null) {
        pr = String(p.id);
        const rs = Array.isArray(p.reviewers) ? p.reviewers : [];
        if (rs.some((r) => r.status === "NEEDS_WORK")) review = "changes_requested";
        else if (rs.length > 0 && rs.every((r) => r.status === "APPROVED")) review = "approved";
        else review = "pending";
        const d = p.buildStatus;
        if (d) {
          if ((d.failed ?? 0) > 0) build = "fail";
          else if ((d.inProgress ?? 0) > 0) build = "running";
          else if ((d.successful ?? 0) > 0) build = "pass";
        }
      }
    } catch {}
    fs.mkdirSync(path.dirname(${JSON.stringify(cacheFile)}), { recursive: true });
    fs.writeFileSync(${JSON.stringify(cacheFile)}, JSON.stringify({ pr, review, build, time: Math.floor(Date.now()/1000) }));
  `;
}
