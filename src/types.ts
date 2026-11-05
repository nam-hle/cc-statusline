/** The subset of Claude Code's status-line stdin JSON that we read. */
export interface StatusInput {
  cwd?: string;
  session_id?: string;
  session_name?: string;
  model?: { id?: string; display_name?: string };
  workspace?: { current_dir?: string; project_dir?: string };
  output_style?: { name?: string };
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  context_window?: {
    total_output_tokens?: number;
    context_window_size?: number;
    remaining_percentage?: number | null;
    current_usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
  exceeds_200k_tokens?: boolean;
  effort?: { level?: string };
  thinking?: { enabled?: boolean };
  vim?: { mode?: string };
  agent?: { name?: string };
  pr?: { number?: number | string; review_state?: string };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
}

/** Flattened, defaulted fields derived from {@link StatusInput}. */
export interface Fields {
  cwd: string;
  modelId: string;
  effortLevel: string;
  thinkingEnabled: boolean;
  ctxSize: number;
  contextRemaining: number | null | undefined;
  cacheRead: number;
  cacheCreation: number;
  inputTokens: number;
  vimMode: string;
  agentName: string;
  sessionName: string;
  prNumber: string;
  prReviewState: string;
  rlFivePct: number | undefined;
  rlFiveReset: number | undefined;
  rlSevenPct: number | undefined;
  rlSevenReset: number | undefined;
}
