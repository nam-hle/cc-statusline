#!/usr/bin/env node
/**
 * Claude Code status line, in TypeScript, run directly by Node 24 (native type
 * stripping — no build step).
 *
 * Claude Code pipes session JSON on stdin; we print one formatted line to
 * stdout. The script is the hot path (renders on nearly every event), so
 * everything is synchronous: read stdin, do cheap git/cache lookups, print,
 * exit. The only async work is an optional detached command (CC_PR_BUILD_CMD)
 * that updates a cache file for the NEXT render — it never blocks this one.
 *
 * Host-specific behavior is opt-in via env vars (see src/config.ts); with none
 * set the line is fully generic. The pieces live in src/; this file just wires
 * them into the left │ right layout.
 */

import { loadConfig } from "./src/config.ts";
import { C, paint } from "./src/ansi.ts";
import { readStdin, deriveFields } from "./src/input.ts";
import { formatDir } from "./src/dir.ts";
import { formatModel } from "./src/model.ts";
import { buildGitDisplay } from "./src/git.ts";
import { buildUsageSuffix } from "./src/usage.ts";

const cfg = loadConfig();
const f = deriveFields(readStdin());

// ─── LEFT: dir  git  agent  vim ──────────────────────────────────────────────
let left = paint(C.cyan, formatDir(f.cwd, cfg.repoBase));

const gitDisplay = buildGitDisplay(f.cwd, f.prNumber, f.prReviewState, cfg.prBuildCmd, cfg.prFetchCmd);
if (gitDisplay) left += ` ${paint(C.magenta, gitDisplay)}`;
if (f.agentName) left += ` ${paint(C.yellow, `⚡${f.agentName}`)}`;
if (f.vimMode) left += ` ${f.vimMode === "NORMAL" ? paint(C.green, "N") : paint(C.blue, "I")}`;

// ─── RIGHT: model  effort  thinking  ctx%  cache-hit ─────────────────────────
let right = "";

const modelShort = formatModel(f.modelId, f.ctxSize);
if (modelShort) {
  right = paint(C.magenta, modelShort);
  const effortMap: Record<string, { label: string; color: string }> = {
    low: { label: "Lo", color: C.blue },
    medium: { label: "Med", color: C.yellow },
    high: { label: "Hi", color: C.green },
    xhigh: { label: "xHi", color: C.red },
    max: { label: "Max", color: C.red },
  };
  const e = effortMap[f.effortLevel];
  if (e) right += ` ${paint(e.color, e.label)}`;
  if (f.thinkingEnabled) right += ` ${paint(C.cyan, "✻")}`;
}

if (f.contextRemaining != null) {
  const used = Math.round(100 - Number(f.contextRemaining));
  const ctxTokens = f.cacheRead + f.cacheCreation + f.inputTokens;
  const ctxColor =
    used > 80 || ctxTokens >= 300_000 ? C.red : used > 50 || ctxTokens >= 200_000 ? C.yellow : C.green;
  const tokensLabel = ctxTokens >= 1000 ? `${Math.round(ctxTokens / 1000)}k ` : "";
  const ctxStr = paint(ctxColor, `${tokensLabel}${used}%`);
  right = right ? `${right} ${ctxStr}` : ctxStr;
}

// ─── Emit ────────────────────────────────────────────────────────────────────
// Two lines: context (dir/git/agent/vim) on top, session (model/ctx/usage) below.
const usageSuffix = buildUsageSuffix(f, cfg);
const line2 = `${right}${usageSuffix}`.trim();
process.stdout.write(`${left}\n${line2}\n`);
