import { createHash } from "node:crypto";

export interface OpenRouterBalanceState {
  status: "loading" | "ready" | "stale" | "unavailable";
  balance?: number;
}

const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const REFRESH_MS = 60_000;
const MAX_AGE_MS = 15 * 60_000;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function parseOpenRouterBalance(value: unknown): number | undefined {
  const data = object(object(value)?.data);
  const credits = data?.total_credits;
  const usage = data?.total_usage;
  if (typeof credits !== "number" || !Number.isFinite(credits) || credits < 0
    || typeof usage !== "number" || !Number.isFinite(usage) || usage < 0) return undefined;
  // Preserve zero and negative balances; a key's null limit is not an account balance.
  return credits - usage;
}

export async function resolveOpenRouterKey(
  getProviderKey: () => Promise<string | undefined>,
  managementKey = process.env.OPENROUTER_MANAGEMENT_KEY,
): Promise<string | undefined> {
  return managementKey?.trim() || (await getProviderKey())?.trim() || undefined;
}

// Bound credential resolution too, even if the provider's resolver ignores cancellation.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

export class OpenRouterBalanceClient {
  private state: OpenRouterBalanceState = { status: "loading" };
  private identity?: string;
  private pending?: Promise<void>;
  private controller?: AbortController;
  private nextRefresh = 0;
  private fetchedAt = 0;
  private failures = 0;
  private disposed = false;
  private readonly options: {
    getKey: () => Promise<string | undefined>;
    onChange: () => void;
    fetch?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
  };

  constructor(options: OpenRouterBalanceClient["options"]) { this.options = options; }

  getState(): OpenRouterBalanceState { return this.state; }

  refresh(provider: string | undefined): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (provider !== "openrouter") {
      this.reset();
      return Promise.resolve();
    }
    if (this.state.balance !== undefined && !this.usable()) this.publish({ status: "unavailable" });
    if (this.pending) return this.pending;
    const controller = new AbortController();
    this.controller = controller;
    // Resolve keys on each footer tick so a changed account bypasses the refresh delay.
    const pending = this.load(controller).finally(() => {
      if (this.controller === controller) {
        this.pending = undefined;
        this.controller = undefined;
      }
    });
    this.pending = pending;
    return pending;
  }

  dispose(): void { this.disposed = true; this.reset(); }

  private now(): number { return (this.options.now ?? Date.now)(); }

  private usable(): boolean {
    const age = this.now() - this.fetchedAt;
    return this.state.balance !== undefined && age >= 0 && age < MAX_AGE_MS;
  }

  private publish(state: OpenRouterBalanceState): void {
    if (JSON.stringify(this.state) === JSON.stringify(state)) return;
    this.state = state;
    this.options.onChange();
  }

  private reset(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.pending = undefined;
    this.identity = undefined;
    this.nextRefresh = 0;
    this.fetchedAt = 0;
    this.failures = 0;
    this.publish({ status: "loading" });
  }

  private async load(controller: AbortController): Promise<void> {
    const current = () => !this.disposed && this.controller === controller && !controller.signal.aborted;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(this.options.timeoutMs ?? 10_000)]);
    let retryAfter = 0;
    let keyResolved = false;
    try {
      const key = (await abortable(this.options.getKey(), signal))?.trim();
      if (!current()) return;
      if (!key) {
        this.identity = undefined;
        this.publish({ status: "unavailable" });
        return;
      }
      keyResolved = true;
      const identity = createHash("sha256").update(key).digest("hex");
      if (identity !== this.identity) {
        this.identity = identity;
        this.nextRefresh = 0;
        this.failures = 0;
        this.publish({ status: "loading" });
      }
      if (this.now() < this.nextRefresh) return;
      const response = await (this.options.fetch ?? fetch)(CREDITS_URL, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "pi-statusbar" },
        redirect: "error", signal,
      });
      if (!current()) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) this.publish({ status: "unavailable" });
        const retry = response.headers.get("retry-after");
        if (retry) {
          retryAfter = Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - this.now();
          if (!Number.isFinite(retryAfter)) retryAfter = 0;
        }
        await response.body?.cancel();
        throw new Error("OpenRouter balance request failed");
      }
      const balance = parseOpenRouterBalance(await response.json());
      if (!current()) return;
      if (balance === undefined) throw new Error("OpenRouter balance unavailable");
      this.fetchedAt = this.now();
      this.failures = 0;
      this.nextRefresh = this.fetchedAt + REFRESH_MS;
      this.publish({ status: "ready", balance });
    } catch {
      if (!current()) return;
      if (!keyResolved) {
        // Cannot verify the account: do not retain a previous account's balance.
        this.identity = undefined;
        this.publish({ status: "unavailable" });
        return;
      }
      this.failures++;
      this.nextRefresh = this.now() + Math.max(
        Math.min(REFRESH_MS * 2 ** Math.min(this.failures - 1, 4), MAX_AGE_MS),
        Math.min(Math.max(0, retryAfter), 60 * 60_000),
      );
      this.publish(this.usable()
        ? { status: "stale", balance: this.state.balance } : { status: "unavailable" });
    }
  }
}
