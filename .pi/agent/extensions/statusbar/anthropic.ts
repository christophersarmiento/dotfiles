import type { CodexQuota, CodexQuotaState } from "./codex.ts";

// The worker also refreshes its snapshot from response rate-limit headers, so
// polling /usage is a slow fallback; Anthropic 429s it when polled per minute.
const REFRESH_MS = 5 * 60_000;
// Poll interval plus the worker's jittered ~5 min cache TTL, with slack.
const STALE_MS = 12 * 60_000;
const MAX_AGE_MS = 30 * 60_000;
// After a turn, re-read the header-fed snapshot at most this often.
const NUDGE_MS = 30_000;

export function parseAnthropicUsage(value: unknown, now: number): { quota: CodexQuota; fetchedAt: number } | undefined {
  if (!value || typeof value !== "object") return;
  const report = value as { fetchedAt?: unknown; limits?: unknown };
  if (typeof report.fetchedAt !== "number" || !Number.isFinite(report.fetchedAt)
    || report.fetchedAt > now || now - report.fetchedAt >= MAX_AGE_MS || !Array.isArray(report.limits)) return;
  const quota: CodexQuota = {};
  for (const limit of report.limits) {
    if (!limit || typeof limit !== "object" || typeof limit.usedPercent !== "number"
      || !Number.isFinite(limit.usedPercent) || limit.usedPercent < 0) continue;
    const key = limit.id === "anthropic:5h" ? "primary" : limit.id === "anthropic:7d" ? "secondary" : undefined;
    if (!key) continue;
    const resetAt = typeof limit.resetAt === "number" && Number.isFinite(limit.resetAt)
      && limit.resetAt > 0 && limit.resetAt <= 8.64e15 ? limit.resetAt : null;
    if (resetAt !== null && resetAt <= now) continue;
    quota[key] = { usedPercent: limit.usedPercent, windowSeconds: key === "primary" ? 18000 : 604800, resetAt };
  }
  return quota.primary || quota.secondary ? { quota, fetchedAt: report.fetchedAt } : undefined;
}

/** Uses the provider's existing worker; no tokens or SQLite access in the footer. */
export class AnthropicUsageClient {
  private state: CodexQuotaState = { status: "loading" };
  private controller?: AbortController;
  private pending?: Promise<void>;
  private nextRefresh = 0;
  private fetchedAt = 0;
  private lastRequest = 0;
  private failures = 0;
  private disposed = false;

  private readonly options: {
    isLoggedIn: () => boolean;
    request: (signal: AbortSignal) => Promise<unknown>;
    onChange: () => void;
    now?: () => number;
    timeoutMs?: number;
  };
  constructor(options: AnthropicUsageClient["options"]) { this.options = options; }

  getState(): CodexQuotaState { return this.state; }
  private now(): number { return (this.options.now ?? Date.now)(); }
  private publish(state: CodexQuotaState): void {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return;
    this.state = state;
    this.options.onChange();
  }
  private reset(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.pending = undefined;
    this.nextRefresh = this.fetchedAt = this.lastRequest = this.failures = 0;
    this.publish({ status: "loading" });
  }
  dispose(): void { this.disposed = true; this.reset(); }

  /** A turn just finished: the worker likely has header-fed usage, so re-read it soon (not during failure backoff). */
  nudge(): void {
    if (this.failures) return;
    this.nextRefresh = Math.min(this.nextRefresh, Math.max(this.now(), this.lastRequest + NUDGE_MS));
  }

  refresh(provider: string | undefined): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (provider !== "anthropic-omp") { this.reset(); return Promise.resolve(); }
    let loggedIn = false;
    try { loggedIn = this.options.isLoggedIn(); } catch {}
    if (!loggedIn) {
      this.reset(); this.publish({ status: "unavailable" }); return Promise.resolve();
    }
    const now = this.now();
    if (this.state.quota && (now < this.fetchedAt || now - this.fetchedAt >= MAX_AGE_MS
      || Object.values(this.state.quota).some(window => window && window.resetAt !== null && window.resetAt <= now))) {
      this.publish({ status: "unavailable" });
      if (!this.failures) this.nextRefresh = 0;
    }
    if (this.pending) return this.pending;
    if (now < this.nextRefresh) return Promise.resolve();
    this.lastRequest = now;
    const controller = new AbortController();
    this.controller = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(this.options.timeoutMs ?? 12_000)]);
    const current = () => !this.disposed && this.controller === controller && !controller.signal.aborted;
    const pending = (async () => {
      try {
        // Bound even an absent provider listener or an unresponsive worker.
        const value = await new Promise<unknown>((resolve, reject) => {
          const abort = () => reject(new Error("Usage request cancelled"));
          signal.addEventListener("abort", abort, { once: true });
          Promise.resolve().then(() => { signal.throwIfAborted(); return this.options.request(signal); }).then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
        });
        if (!current()) return;
        const parsed = parseAnthropicUsage(value, this.now());
        if (!parsed) throw new Error("Usage unavailable");
        this.fetchedAt = parsed.fetchedAt;
        this.failures = 0;
        this.nextRefresh = this.now() + REFRESH_MS;
        this.publish({ status: this.now() - parsed.fetchedAt > STALE_MS ? "stale" : "ready", quota: parsed.quota });
      } catch {
        if (!current()) return;
        this.failures++;
        this.nextRefresh = this.now() + Math.min(REFRESH_MS * 2 ** Math.min(this.failures - 1, 4), MAX_AGE_MS);
        // A failed lookup may mean logout or account rotation; never retain another account's quota.
        this.publish({ status: "unavailable" });
      }
    })().finally(() => {
      if (this.controller === controller) { this.controller = undefined; this.pending = undefined; }
    });
    this.pending = pending;
    return pending;
  }
}
