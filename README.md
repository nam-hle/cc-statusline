# cc-statusline

A [Claude Code status line](https://code.claude.com/docs/en/statusline) written in TypeScript and run **directly by Node 24** — native type stripping, no build step.

Claude Code pipes session JSON on stdin; the script prints one formatted line to stdout. It renders on nearly every event, so everything is synchronous: read stdin → cheap git/cache lookups → print → exit. Host-specific behavior is opt-in via env vars, so with none set the line is fully generic.

## What it shows

```
repo master ↑1 │ Opus 4.8 (1M) xHi ✻ 28% ⚡99%  · 0m 7%/19%
└┬─┘ └──┬──┘     └────┬─────┘ └┬┘ │ └┬┘ └─┬─┘    └┬┘ └──┬──┘
 dir    git+PR        model    │  │  ctx  cache    elapsed rate
                            effort thinking          (5h / 7d)
```

| Segment | Source field |
|---|---|
| `repo` / `repo/sub` | `workspace.current_dir` |
| `master ↑1` + `PR#…` + `+/~/-` | local git + `pr.number` / `pr.review_state` |
| `Opus 4.8 (1M)` | `model.id` + `context_window.context_window_size` |
| `xHi` | `effort.level` (Lo / Med / Hi / xHi / Max) |
| `✻` | `thinking.enabled` |
| `28%` | `context_window.remaining_percentage` |
| `⚡99%` | `context_window.current_usage.*` (cache-hit ratio) |
| `0m 7%/19%` | `rate_limits.*` (5h elapsed + 5h / 7d utilization) |

## Run

```sh
node statusline.ts < fixtures/full.json   # demo render
pnpm typecheck                            # tsc --noEmit
```

`tsconfig.json` sets `erasableSyntaxOnly` + `verbatimModuleSyntax`, so `tsc` rejects anything Node's type stripper can't run — typecheck-clean means runnable.

## Configuration (all optional)

| Env var | Default | Effect |
|---|---|---|
| `CC_USAGE_MODE` | `weekly` | `weekly` (5h + 7d %) or `credits` ($/day) |
| `CC_SHOW_ELAPSED` | `true` | Show 5h-window elapsed time in weekly mode |
| `CC_REPO_BASE` | _(unset)_ | Absolute dir whose children are repos; cwd under it renders as `<repo>/<short-subdir>` instead of `<parent>/<dir>` |
| `CC_PR_BUILD_CMD` | _(unset)_ | Command template printing PR build JSON (`{pr}`, `{repo}` placeholders); adds a ✓/✗/⟳ build icon. Expected JSON: `{ failed, inProgress, successful }` counts |
| `CC_USAGE_HELPER` | _(unset)_ | Path to a helper that prints rate-limit / credits JSON; fallback before the session JSON carries `rate_limits` |

## Wire into Claude Code

In `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node <path-to>/cc-statusline/statusline.ts"
  }
}
```

If the status-line shell doesn't have your Node on `PATH` (e.g. nvm), use an absolute node path — run `which node` to find it. Update it on a Node major upgrade.
