/** Env-driven configuration. With nothing set, the status line is fully generic. */

export interface Config {
  /** "weekly" (5h + 7d %) or "credits" ($/day). */
  usageMode: "credits" | "weekly";
  /** Show 5h-window elapsed time in weekly mode. */
  showElapsed: boolean;
  /** Dir whose immediate children are repos → "<repo>/<short-subdir>". */
  repoBase: string;
  /** Command template (with {pr}/{repo}) printing PR build JSON. */
  prBuildCmd: string;
  /**
   * Command template (with {branch}/{repo}) printing PR list JSON for the
   * current branch — used to discover the PR number, review state, and build
   * status when the Claude Code JSON has none (e.g. Bitbucket via a CLI).
   */
  prFetchCmd: string;
  /** Helper script printing rate-limit / credits JSON. */
  usageHelper: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    usageMode: env["CC_USAGE_MODE"] === "credits" ? "credits" : "weekly",
    showElapsed: env["CC_SHOW_ELAPSED"] !== "false",
    repoBase: env["CC_REPO_BASE"] ?? "",
    prBuildCmd: env["CC_PR_BUILD_CMD"] ?? "",
    prFetchCmd: env["CC_PR_FETCH_CMD"] ?? "",
    usageHelper: env["CC_USAGE_HELPER"] ?? "",
  };
}
