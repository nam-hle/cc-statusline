/** Usage suffix: weekly (5h + 7d %) or credits ($/day). */

import { readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { C, paint, colorForPct } from "./ansi.ts";
import { sh } from "./exec.ts";
import type { Config } from "./config.ts";
import type { Fields } from "./types.ts";

function formatElapsed(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

export function buildUsageSuffix(fields: Fields, cfg: Config): string {
  return cfg.usageMode === "credits"
    ? buildCreditsSuffix(cfg)
    : buildWeeklySuffix(fields, cfg);
}

function buildWeeklySuffix(fields: Fields, cfg: Config): string {
  // Prefer live rate-limit data from JSON (.rate_limits.*). resets_at is epoch
  // seconds. Fall back to the helper early in the session.
  let fivePct: number | undefined;
  let sevenPct: number | undefined;
  let resetsAt: number | undefined;
  let sevenResetsAt: number | undefined;

  if (fields.rlFivePct != null && fields.rlSevenPct != null) {
    fivePct = fields.rlFivePct;
    sevenPct = fields.rlSevenPct;
    resetsAt = fields.rlFiveReset; // already epoch seconds
    sevenResetsAt = fields.rlSevenReset ?? helperSevenReset(cfg);
  } else if (cfg.usageHelper) {
    const raw = sh(`USAGE_MODE=weekly ${cfg.usageHelper} --raw`);
    if (raw) {
      try {
        const j = JSON.parse(raw) as {
          five_hour?: { utilization?: number; resets_at?: string };
          seven_day?: { utilization?: number; resets_at?: string };
        };
        fivePct = j.five_hour?.utilization;
        sevenPct = j.seven_day?.utilization;
        resetsAt = parseIsoEpoch(j.five_hour?.resets_at);
        sevenResetsAt = parseIsoEpoch(j.seven_day?.resets_at);
      } catch {
        /* ignore */
      }
    }
  }

  if (fivePct == null || sevenPct == null) return "";

  const fiveInt = Math.round(fivePct);
  const sevenInt = Math.round(sevenPct);

  // Elapsed = 5h window - remaining.
  let elapsedLabel = "";
  if (resetsAt != null) {
    const remaining = resetsAt - Math.floor(Date.now() / 1000);
    if (remaining > 0) elapsedLabel = formatElapsed(18000 - remaining); // 5h = 18000s
  }
  if (!elapsedLabel) elapsedLabel = formatElapsed(Math.round((300 * fiveInt) / 100) * 60);

  const sep = paint(C.grey, "·");
  const ratio = `${paint(colorForPct(fiveInt), `${fiveInt}%`)}${paint(C.grey, "/")}${paint(colorForPct(sevenInt), `${sevenInt}%`)}`;

  const eta = buildWeeklyEta(sevenPct, sevenResetsAt);

  if (cfg.showElapsed && elapsedLabel) {
    return ` ${sep} ${paint(colorForPct(fiveInt), elapsedLabel)} ${ratio}${eta}`;
  }
  return ` ${sep} ${ratio}${eta}`;
}

const WEEK_SECONDS = 7 * 24 * 3600;

function helperSevenReset(cfg: Config): number | undefined {
  if (!cfg.usageHelper) return undefined;
  const raw = sh(`USAGE_MODE=weekly ${cfg.usageHelper} --raw`);
  if (!raw) return undefined;
  try {
    const j = JSON.parse(raw) as { seven_day?: { resets_at?: string } };
    return parseIsoEpoch(j.seven_day?.resets_at);
  } catch {
    return undefined;
  }
}

function parseIsoEpoch(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const parsed = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatWeekdayTime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/** " out Fri 14:30" when the weekly quota runs out before reset at the current average rate. */
function buildWeeklyEta(sevenPct: number, resetsAt: number | undefined): string {
  if (resetsAt == null || sevenPct <= 0) return "";
  const now = Math.floor(Date.now() / 1000);
  const untilReset = resetsAt - now;
  const elapsed = WEEK_SECONDS - untilReset;
  if (untilReset <= 0 || elapsed <= 0) return "";
  const untilEmpty = sevenPct >= 100 ? 0 : ((100 - sevenPct) * elapsed) / sevenPct;
  if (untilEmpty >= untilReset) return ` ${paint(C.green, "ok")}`;
  const color = untilEmpty < 86400 ? C.red : C.yellow;
  return ` ${paint(color, `out ${formatWeekdayTime(now + untilEmpty)}`)}`;
}

function buildCreditsSuffix(cfg: Config): string {
  // Credits mode is entirely driven by the optional helper.
  if (!cfg.usageHelper) return "";
  const usageInfo = sh(`USAGE_MODE=credits ${cfg.usageHelper}`);
  if (!usageInfo || usageInfo.startsWith("⚠️")) return "";

  let dailyRate = "";
  // The helper is expected to keep its cache next to itself.
  const cachePath = `${dirname(cfg.usageHelper)}/.usage-cache.json`;
  if (existsSync(cachePath)) {
    try {
      const c = JSON.parse(readFileSync(cachePath, "utf8")) as {
        usage?: { extra_usage?: { used_credits?: number; monthly_limit?: number } };
      };
      const usedCents = c.usage?.extra_usage?.used_credits ?? 0;
      const dayOfMonth = new Date().getDate();
      if (usedCents > 0 && dayOfMonth > 0) {
        const dailyUsd = usedCents / 100 / dayOfMonth;
        const dailyFmt = dailyUsd.toFixed(1);
        const limitUsd = (c.usage?.extra_usage?.monthly_limit ?? 0) / 100;
        const leftUsd = limitUsd - usedCents / 100;
        if (dailyUsd > 0) {
          const budgetDays = Math.floor(leftUsd / dailyUsd);
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const daysLeft = Math.min(budgetDays, daysInMonth - dayOfMonth);
          const daysColor = daysLeft <= 5 ? C.red : daysLeft <= 15 ? C.yellow : C.green;
          dailyRate = ` ${paint(C.grey, `$${dailyFmt}/d`)} ${paint(daysColor, `${daysLeft}d`)}`;
        } else {
          dailyRate = ` ${paint(C.grey, `$${dailyFmt}/d`)}`;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return ` ${paint(C.grey, "·")} ${usageInfo}${dailyRate}`;
}
