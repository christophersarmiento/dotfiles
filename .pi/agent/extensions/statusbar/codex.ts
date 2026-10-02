import { createHash } from "node:crypto";

export interface CodexUsageWindow {
  usedPercent: number;
  windowSeconds: number | null;
  resetAt: number | null;
}

export interface CodexQuota {
  primary?: CodexUsageWindow;
  secondary?: CodexUsageWindow;
}

export interface CodexQuotaState {
  status: "loading" | "ready" | "stale" | "unavailable";
  quota?: CodexQuota;
}

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_MS = 60_000;
const MAX_AGE_MS = 15 * 60_000;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function codexCredential(value: unknown): { access: string; accountId?: string } | undefined {
  const auth = object(value);
  if (auth?.type !== "oauth" || typeof auth.access !== "string" || !auth.access.trim()) return undefined;
  let accountId = typeof auth.accountId === "string" && auth.accountId.trim() ? auth.accountId : undefined;
  if (!accountId) {
    try {
      const payload = object(JSON.parse(Buffer.from(auth.access.split(".")[1], "base64url").toString("utf8")));
      const claim = object(payload?.["https://api.openai.com/auth"]);
      if (typeof claim?.chatgpt_account_id === "string" && claim.chatgpt_account_id.trim()) accountId = claim.chatgpt_account_id;
    } catch {}
  }
  return { access: auth.access, accountId };
}

function parseWindow(value: unknown): CodexUsageWindow | undefined {
  const raw = object(value);
  const usedPercent = number(raw?.used_percent);
  if (usedPercent === null) return undefined;
  const seconds = number(raw?.limit_window_seconds);
  const reset = number(raw?.reset_at);
  return {
    usedPercent,
    windowSeconds: seconds !== null && seconds > 0 ? seconds : null,
    resetAt: reset !== null && reset > 0 && reset * 1000 <= 8.64e15 ? reset * 1000 : null,
  };
}

export function parseCodexQuota(value: unknown): CodexQuota | undefined {
  const limits = object(object(value)?.rate_limit);
  const primary = parseWindow(limits?.primary_window);
  const secondary = parseWindow(limits?.secondary_window);
  return primary || secondary ? { primary, secondary } : undefined;
}

export class CodexQuotaClient {
  private state: CodexQuotaState = { status: "loading" };
  private identity?: string;
  private pending?: Promise<void>;
  private controller?: AbortController;
  private nextRefresh = 0;
  private fetchedAt = 0;
  private failures = 0;
  private disposed = false;
  private readonly options: {
    getCredential: () => unknown;
    onChange: () => void;
    fetch?: typeof fetch;
    now?: () => number;
  };

  constructor(options: CodexQuotaClient["options"]) { this.options = options; }

  getState(): CodexQuotaState { return this.state; }

  refresh(provider: string | undefined): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (provider !== "openai-codex") {
      this.reset();
      return Promise.resolve();
    }
    let credential: ReturnType<typeof codexCredential>;
    try { credential = codexCredential(this.options.getCredential()); } catch {}
    if (!credential) {
      this.reset();
      this.publish({ status: "unavailable" });
      return Promise.resolve();
    }
    const identity = createHash("sha256").update(`${credential.access}\0${credential.accountId ?? ""}`).digest("hex");
    if (identity !== this.identity) {
      this.reset();
      this.identity = identity;
    }
    const now = this.now();
    if (this.state.quota && !this.usable(now)) {
      this.publish({ status: "unavailable" });
      if (!this.failures) this.nextRefresh = 0;
    }
    if (this.pending) return this.pending;
    if (now < this.nextRefresh) return Promise.resolve();
    const controller = new AbortController();
    this.controller = controller;
    const pending = this.load(credential, controller).finally(() => {
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

  private usable(now: number): boolean {
    return !!this.state.quota && now >= this.fetchedAt && now - this.fetchedAt < MAX_AGE_MS
      && Object.values(this.state.quota).every(window => !window || window.resetAt === null || window.resetAt > now);
  }

  private publish(state: CodexQuotaState): void {
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

  private async load(credential: { access: string; accountId?: string }, controller: AbortController): Promise<void> {
    const current = () => !this.disposed && this.controller === controller && !controller.signal.aborted;
    let retryAfter = 0;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${credential.access}`, Accept: "application/json", "User-Agent": "pi-statusbar",
      };
      if (credential.accountId) headers["ChatGPT-Account-Id"] = credential.accountId;
      const response = await (this.options.fetch ?? fetch)(USAGE_URL, {
        headers, redirect: "error",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
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
        throw new Error("Codex usage request failed");
      }
      const quota = parseCodexQuota(await response.json());
      if (!current()) return;
      if (!quota) throw new Error("Codex usage unavailable");
      // A reset that already passed is not a current usage measurement.
      for (const key of ["primary", "secondary"] as const) {
        const resetAt = quota[key]?.resetAt;
        if (resetAt != null && resetAt <= this.now()) delete quota[key];
      }
      if (!quota.primary && !quota.secondary) throw new Error("Codex usage expired");
      this.fetchedAt = this.now();
      this.failures = 0;
      this.nextRefresh = this.fetchedAt + REFRESH_MS;
      this.publish({ status: "ready", quota });
    } catch {
      if (!current()) return;
      this.failures++;
      this.nextRefresh = this.now() + Math.max(
        Math.min(REFRESH_MS * 2 ** Math.min(this.failures - 1, 4), MAX_AGE_MS),
        Math.min(Math.max(0, retryAfter), 60 * 60_000),
      );
      this.publish(this.usable(this.now())
        ? { status: "stale", quota: this.state.quota } : { status: "unavailable" });
    }
  }
}
