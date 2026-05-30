/** Current-directory formatting for the left side. */

import { basename, dirname } from "node:path";

function truncatePart(part: string): string {
  return part.length > 7 ? part.slice(0, 7) : part;
}

export function formatDir(cwd: string, repoBase: string): string {
  if (!cwd) return "?";
  // When cwd is under repoBase, show "<repo>/<short-subdir>".
  if (repoBase && cwd.startsWith(`${repoBase}/`)) {
    const rel = cwd.slice(repoBase.length + 1);
    const repoName = rel.split("/")[0] ?? "";
    const subPath = rel.slice(repoName.length).replace(/^\//, "");
    if (!subPath) return repoName;
    return `${repoName}/${truncatePart(basename(subPath))}`;
  }
  // Generic: "<parent>/<dir>", each part truncated.
  const part2 = basename(cwd);
  const part1 = basename(dirname(cwd));
  return `${truncatePart(part1)}/${truncatePart(part2)}`;
}
