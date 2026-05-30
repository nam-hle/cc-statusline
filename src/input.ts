/** Read stdin JSON and flatten it into defaulted {@link Fields}. */

import { readFileSync } from "node:fs";
import type { StatusInput, Fields } from "./types.ts";

export function readStdin(): StatusInput {
  try {
    const raw = readFileSync(0, "utf8"); // fd 0 = stdin
    return raw.trim() ? (JSON.parse(raw) as StatusInput) : {};
  } catch {
    return {};
  }
}

export function deriveFields(data: StatusInput): Fields {
  const usage = data.context_window?.current_usage ?? null;
  return {
    cwd: data.workspace?.current_dir ?? data.cwd ?? "",
    modelId: data.model?.id ?? "",
    effortLevel: data.effort?.level ?? "",
    thinkingEnabled: data.thinking?.enabled === true,
    ctxSize: data.context_window?.context_window_size ?? 0,
    contextRemaining: data.context_window?.remaining_percentage,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheCreation: usage?.cache_creation_input_tokens ?? 0,
    inputTokens: usage?.input_tokens ?? 0,
    vimMode: data.vim?.mode ?? "",
    agentName: data.agent?.name ?? "",
    prNumber: data.pr?.number != null ? String(data.pr.number) : "",
    prReviewState: data.pr?.review_state ?? "",
    rlFivePct: data.rate_limits?.five_hour?.used_percentage,
    rlFiveReset: data.rate_limits?.five_hour?.resets_at,
    rlSevenPct: data.rate_limits?.seven_day?.used_percentage,
  };
}
