/** Read stdin JSON and flatten it into defaulted {@link Fields}. */

import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StatusInput, Fields } from "./types.ts";

const MAX_SESSION_FILE_BYTES = 8192;

/** Undocumented: ~/.claude/sessions/<pid>.json holds {sessionId, name}. */
function lookupDerivedSessionName(sessionId: string | undefined): string {
  if (!sessionId) return "";
  try {
    const dir = join(homedir(), ".claude", "sessions");
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = readFileSync(join(dir, file), "utf8");
        if (raw.length > MAX_SESSION_FILE_BYTES) continue;
        const entry = JSON.parse(raw) as { sessionId?: string; name?: string };
        if (entry.sessionId === sessionId) return entry.name ?? "";
      } catch {
        continue;
      }
    }
  } catch {
    return "";
  }
  return "";
}

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
    sessionName: lookupDerivedSessionName(data.session_id) || data.session_name || "",
    prNumber: data.pr?.number != null ? String(data.pr.number) : "",
    prReviewState: data.pr?.review_state ?? "",
    rlFivePct: data.rate_limits?.five_hour?.used_percentage,
    rlFiveReset: data.rate_limits?.five_hour?.resets_at,
    rlSevenPct: data.rate_limits?.seven_day?.used_percentage,
  };
}
