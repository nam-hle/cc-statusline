/** Git segment: branch, file changes, ahead/behind, PR badge. */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { C, paint } from "./ansi.ts";
import { gitIn } from "./exec.ts";
import { buildPrIndicator } from "./pr.ts";

export function buildGitDisplay(
  cwd: string,
  prNumber: string,
  prReviewState: string,
  prBuildCmd: string,
  prFetchCmd: string,
): string {
  if (!gitIn(cwd, "rev-parse --git-dir")) return "";

  let branch = gitIn(cwd, "rev-parse --abbrev-ref HEAD");

  // File changes (staged + unstaged + untracked), honoring an exclude file.
  let added = 0;
  let deleted = 0;
  let modified = 0;
  const excludeFile = `${homedir()}/.claude/statusline-exclude`;
  const status = gitIn(cwd, "status --porcelain");
  if (status) {
    let lines = status.split("\n");
    if (existsSync(excludeFile)) {
      const patterns = readFileSync(excludeFile, "utf8")
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      lines = lines.filter((line) => !patterns.some((p) => line.includes(p)));
    }
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("??") || line.startsWith("A")) added++;
      else if (line.startsWith("D") || line[1] === "D") deleted++;
      else if (line.startsWith("R") || line.startsWith("M") || line[1] === "M") modified++;
    }
  }

  // Commits ahead/behind upstream.
  let tracking = "";
  const upstream = gitIn(cwd, "rev-parse --abbrev-ref --symbolic-full-name @{u}");
  if (upstream) {
    const ahead = parseInt(gitIn(cwd, "rev-list --count @{u}..HEAD") || "0", 10);
    const behind = parseInt(gitIn(cwd, "rev-list --count HEAD..@{u}") || "0", 10);
    if (ahead > 0) tracking += `↑${ahead}`;
    if (behind > 0) tracking += `↓${behind}`;
  }

  const prIndicator = buildPrIndicator(cwd, prNumber, prReviewState, prBuildCmd, prFetchCmd);

  // Branch: drop prefix before first slash, then keep whole words up to 30 chars.
  if (branch.includes("/")) branch = branch.slice(branch.indexOf("/") + 1);
  if (branch.length > 30) {
    const words = branch.split(/[-_]/);
    let kept = (words[0] ?? branch).slice(0, 30);
    for (let i = 1; i < words.length; i++) {
      const next = `${kept}-${words[i]}`;
      if (next.length > 30) break;
      kept = next;
    }
    branch = `${kept}…`;
  }

  let display = branch;
  if (prIndicator) display += ` ${prIndicator}`;

  const changes: string[] = [];
  if (added > 0) changes.push(paint(C.green, `+${added}`));
  if (modified > 0) changes.push(paint(C.yellow, `~${modified}`));
  if (deleted > 0) changes.push(paint(C.red, `-${deleted}`));
  if (changes.length) display += ` ${changes.join(" ")}`;

  if (tracking) display += ` ${tracking}`;
  return display;
}
