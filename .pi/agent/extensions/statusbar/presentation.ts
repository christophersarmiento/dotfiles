import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { CodexQuotaState } from "./codex.ts";
import type { CopilotQuotaState } from "./copilot.ts";
import type { OpenRouterBalanceState } from "./openrouter.ts";

const C = {
  blue: "\x1b[34m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  orange: "\x1b[91m", red: "\x1b[31m", white: "\x1b[37m",
  dim: "\x1b[2m", reset: "\x1b[0m",
};
const separator = ` ${C.dim}|${C.reset} `;

export interface FooterState {
  model: string;
  provider?: string;
  copilot?: CopilotQuotaState;
  codex?: CodexQuotaState;
  anthropic?: CodexQuotaState;
  openrouter?: OpenRouterBalanceState;
  directory: string;
  branch: string | null;
  gitStats: string | null;
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
  effort: string;
  styleEffort: (text: string) => string;
  session: number;
  weekly: { cost: number; complete: boolean };
  statuses: string[];
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const value = n / 1_000_000;
    return Number.isInteger(value) ? `${value}M` : `${value.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n)}`;
}

function usageColor(percent: number): string {
  if (percent >= 90) return C.red;
  if (percent >= 70) return C.orange;
  if (percent >= 50) return C.yellow;
  return C.green;
}

function singleLine(value: string): string {
  return value.replace(/[\r\n\t]/g, " ");
}

const quotaNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const resetFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function copilotUsage(state: CopilotQuotaState | undefined, compact: boolean): string {
  if (!state || state.status === "loading") return `${C.dim}usage loading…${C.reset}`;
  const quota = state.quota;
  const reset = quota?.resetAt ? ` ${C.dim}@ ${resetFormatter.format(quota.resetAt)}${C.reset}` : "";
  if (!quota || quota.used === null) return `${C.dim}usage unavailable${C.reset}${reset}`;
  const unit = quota.unit === "requests" && !compact ? " premium requests" : "";
  const label = compact && quota.unit === "requests" ? "requests" : "usage";
  const used = quotaNumber.format(quota.used);
  const percent = quota.limit === null ? null : quota.used / quota.limit * 100;
  const total = quota.limit === null ? used : `${used}/${quotaNumber.format(quota.limit)} (${Math.round(percent!)}%)`;
  const color = state.status === "stale" ? C.dim : percent === null ? C.cyan : usageColor(percent);
  return `${C.white}${label}${C.reset} ${color}${state.status === "stale" ? "~" : ""}${total}${unit}${C.reset}${reset}`;
}

function windowUsage(state: CodexQuotaState | undefined, compact: boolean): string {
  if (!state || state.status === "loading") return `${C.dim}usage loading…${C.reset}`;
  if (!state.quota) return `${C.dim}usage unavailable${C.reset}`;
  const parts = (["primary", "secondary"] as const).map(key => {
    const window = state.quota?.[key];
    if (!window) return "";
    const seconds = window.windowSeconds;
    const label = seconds === null ? key
      : seconds % 86400 === 0 ? `${seconds / 86400}d`
      : seconds % 3600 === 0 ? `${seconds / 3600}h`
      : `${quotaNumber.format(seconds / 60)}m`;
    const color = state.status === "stale" ? C.dim : usageColor(window.usedPercent);
    const reset = !compact && window.resetAt !== null
      ? ` ${C.dim}@ ${new Intl.DateTimeFormat("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      }).format(window.resetAt)}${C.reset}` : "";
    return `${C.white}${label}${C.reset} ${color}${state.status === "stale" ? "~" : ""}${Math.round(window.usedPercent)}%${C.reset}${reset}`;
  }).filter(Boolean);
  return parts.length ? parts.join(separator) : `${C.dim}usage unavailable${C.reset}`;
}

function openRouterBalance(state: OpenRouterBalanceState | undefined, compact: boolean): string {
  const label = compact ? "bal" : "balance";
  if (!state || state.status === "loading") return `${C.dim}${label} loading…${C.reset}`;
  if (state.balance === undefined) return `${C.dim}${label} unavailable${C.reset}`;
  const color = state.status === "stale" ? C.dim : state.balance <= 0 ? C.red : C.green;
  return `${C.white}${label}${C.reset} ${color}${state.status === "stale" ? "~" : ""}$${state.balance.toFixed(2)}${C.reset}`;
}

export function renderFooter(state: FooterState, width: number): string[] {
  let directory = `${C.cyan}${singleLine(state.directory)}${C.reset}`;
  if (state.branch) directory += `${C.dim}@${C.reset}${C.green}${singleLine(state.branch)}${C.reset}`;
  if (state.gitStats) {
    const [adds, dels] = state.gitStats.split(" ");
    directory += ` ${C.dim}(${C.reset}${C.green}${adds}${C.reset} ${C.red}${dels}${C.reset}${C.dim})${C.reset}`;
  }
  const tokens = state.tokens === null ? "?" : formatTokens(state.tokens);
  const window = state.contextWindow === null ? "?" : formatTokens(state.contextWindow);
  const percent = state.percent === null ? `${C.dim}?` : `${usageColor(state.percent)}${Math.round(state.percent)}%`;
  const effort = state.effort === "medium" ? "med" : state.effort;
  const info = [
    `${C.blue}${singleLine(state.model)}${C.reset}`,
    directory,
    `${C.orange}${tokens}/${window}${C.reset} ${C.dim}(${C.reset}${percent}${C.reset}${C.dim})${C.reset}`,
    `effort: ${state.styleEffort(effort)}${C.reset}`,
  ].join(separator);
  const sessionCost = (compact: boolean) =>
    `${C.white}${compact ? "s" : "session"}${C.reset} ${C.green}$${state.session.toFixed(2)}${C.reset}`;
  const costs = (compact: boolean) => [
    sessionCost(compact),
    `${C.white}${compact ? "w" : "week"}${C.reset} ${C.green}${state.weekly.complete ? "" : "~"}$${state.weekly.cost.toFixed(2)}${C.reset}`,
  ].join(separator);
  const isCopilot = state.provider === "github-copilot";
  const billing = (compact: boolean) => isCopilot ? copilotUsage(state.copilot, compact)
    : state.provider === "openai-codex" ? windowUsage(state.codex, compact)
    : state.provider === "anthropic-omp" ? windowUsage(state.anthropic, compact)
    : state.provider === "openrouter" ? [openRouterBalance(state.openrouter, compact), sessionCost(compact)].join(separator)
    : costs(compact);
  const statuses = state.statuses.map(singleLine).join(separator);
  const full = info + separator + billing(false);
  if (visibleWidth(full) <= width) return [full, truncateToWidth(statuses, width)];
  const costLine = visibleWidth(billing(false)) <= width ? billing(false) : billing(true);
  const statusWidth = width - visibleWidth(costLine) - visibleWidth(separator);
  const statusSuffix = statuses && statusWidth > 3 ? separator + truncateToWidth(statuses, statusWidth) : "";
  return [
    truncateToWidth(info, width),
    truncateToWidth(costLine, width) + statusSuffix,
  ];
}
