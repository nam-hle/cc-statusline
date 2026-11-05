/** Friendly model name: "claude-sonnet-4-6" -> "Sonnet 4.6" (+ "(1M)" for big ctx). */

export function formatModel(modelId: string, ctxSize: number): string {
  if (!modelId) return "";
  const m = modelId.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/);
  if (!m) return "";
  const family = m[1]!;
  const familyCap = family.charAt(0).toUpperCase() + family.slice(1);
  const version = m[3] ? `${m[2]}.${m[3]}` : m[2]!;
  const base = `${familyCap} ${version}`;
  return ctxSize >= 900000 ? `${base} (1M)` : base;
}
