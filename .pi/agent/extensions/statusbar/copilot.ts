import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CopilotQuota {
  unit: "credits" | "requests";
  used: number | null;
  limit: number | null;
  resetAt: number | null;
}

export interface CopilotQuotaState {
  status: "loading" | "ready" | "stale" | "unavailable";
  quota?: CopilotQuota;
}

interface Snapshot {
  version: 1;
  fetchedAt: number;
  quota: CopilotQuota;
}

const REFRESH_MS = 60_000;
const MAX_AGE_MS = 15 * 60_000;
const TIMEOUT_MS = 10_000;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function resetDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function parseCopilotQuota(value: unknown): CopilotQuota | undefined {
  const root = object(value);
  const quota = object(object(root?.quota_snapshots)?.premium_interactions);
  if (!root || !quota) return undefined;
  const tokenBased = quota.token_based_billing ?? root.token_based_billing;
  if (tokenBased !== undefined && typeof tokenBased !== "boolean") return undefined;
  if (tokenBased === undefined && quota.credits_used !== undefined) return undefined;
  const unit = tokenBased === true ? "credits" : "requests";
  const entitlement = amount(quota.entitlement);
  const limit = quota.unlimited === false && quota.has_quota !== false && entitlement !== null && entitlement > 0
    ? entitlement : null;
  let used = unit === "credits" ? amount(quota.credits_used) : null;
  if (unit === "requests" && limit !== null) {
    const remaining = amount(quota.quota_remaining) ?? amount(quota.remaining);
    if (remaining !== null && remaining <= limit) used = limit - remaining;
  }
  return {
    unit, used, limit,
    resetAt: resetDate(root.quota_reset_date_utc) ?? resetDate(root.quota_reset_date),
  };
}

export function copilotCredential(value: unknown): { token: string; url: string } | undefined {
  const credential = object(value);
  if (credential?.type !== "oauth" || typeof credential.refresh !== "string" || !credential.refresh.trim()) return undefined;
  if (credential.enterpriseUrl && credential.enterpriseUrl !== "github.com") return undefined;
  return { token: credential.refresh, url: "https://api.github.com/copilot_internal/user" };
}

function validSnapshot(value: unknown): value is Snapshot {
  const snapshot = object(value);
  const quota = object(snapshot?.quota);
  return snapshot?.version === 1 && amount(snapshot.fetchedAt) !== null && !!quota
    && (quota.unit === "credits" || quota.unit === "requests")
    && (quota.used === null || amount(quota.used) !== null)
    && (quota.limit === null || (amount(quota.limit) !== null && Number(quota.limit) > 0))
    && (quota.resetAt === null || (amount(quota.resetAt) !== null && Number(quota.resetAt) > 0));
}

export class CopilotQuotaClient {
  private state: CopilotQuotaState = { status: "loading" };
  private snapshot?: Snapshot;
  private identity?: string;
  private pending?: Promise<void>;
  private controller?: AbortController;
  private nextRefresh = 0;
  private failures = 0;
  private cacheRead = false;
  private disposed = false;
  private readonly options: {
    getCredential: () => unknown;
    onChange: () => void;
    cacheDir?: string;
    fetch?: typeof fetch;
    now?: () => number;
  };

  constructor(options: CopilotQuotaClient["options"]) {
    this.options = options;
  }

  getState(): CopilotQuotaState {
    return this.state;
  }

  refresh(provider: string | undefined): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (provider !== "github-copilot") {
      this.reset();
      return Promise.resolve();
    }
    let credential: ReturnType<typeof copilotCredential>;
    try {
      credential = copilotCredential(this.options.getCredential());
    } catch {}
    if (!credential) {
      this.reset();
      this.publish({ status: "unavailable" });
      return Promise.resolve();
    }
    const identity = createHash("sha256").update(`${credential.url}\0${credential.token}`).digest("hex");
    if (identity !== this.identity) {
      this.reset();
      this.identity = identity;
      this.publish({ status: "loading" });
    }
    const now = this.now();
    if (this.snapshot && !this.usable(this.snapshot, now)) {
      this.snapshot = undefined;
      if (this.failures === 0) this.nextRefresh = 0;
      this.publish({ status: "unavailable" });
    }
    if (this.pending) return this.pending;
    if (now < this.nextRefresh) return Promise.resolve();
    const controller = new AbortController();
    this.controller = controller;
    const current = () => !this.disposed && this.controller === controller && !controller.signal.aborted;
    const pending = this.load(credential, identity, controller.signal, current).finally(() => {
      if (this.controller === controller) {
        this.pending = undefined;
        this.controller = undefined;
      }
    });
    this.pending = pending;
    return pending;
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private usable(snapshot: Snapshot, now: number): boolean {
    return snapshot.fetchedAt <= now && now - snapshot.fetchedAt < MAX_AGE_MS
      && (snapshot.quota.resetAt === null || snapshot.quota.resetAt > now);
  }

  private publish(state: CopilotQuotaState): void {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return;
    this.state = state;
    this.options.onChange();
  }

  private reset(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.pending = undefined;
    this.identity = undefined;
    this.snapshot = undefined;
    this.nextRefresh = 0;
    this.failures = 0;
    this.cacheRead = false;
    this.state = { status: "loading" };
  }

  private async load(
    credential: { token: string; url: string }, identity: string,
    signal: AbortSignal, current: () => boolean,
  ): Promise<void> {
    const path = this.options.cacheDir ? join(this.options.cacheDir, `${identity}.json`) : undefined;
    if (!this.cacheRead) {
      this.cacheRead = true;
      if (path) {
        try {
          const cached: unknown = JSON.parse(await readFile(path, "utf8"));
          if (!current()) return;
          if (validSnapshot(cached) && this.usable(cached, this.now())) {
            this.snapshot = cached;
            this.nextRefresh = cached.fetchedAt + REFRESH_MS;
            this.publish({ status: this.now() < this.nextRefresh ? "ready" : "stale", quota: cached.quota });
          }
        } catch {}
      }
    }
    if (!current() || this.now() < this.nextRefresh) return;
    let retryAfter = 0;
    try {
      const response = await (this.options.fetch ?? fetch)(credential.url, {
        headers: {
          Authorization: `Bearer ${credential.token}`,
          Accept: "application/json",
          "User-Agent": "pi-statusbar",
        },
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
      if (!current()) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.snapshot = undefined;
          if (path) await unlink(path).catch(() => {});
        }
        const retry = response.headers.get("retry-after");
        if (retry) {
          const seconds = Number(retry);
          retryAfter = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - this.now();
          if (!Number.isFinite(retryAfter)) retryAfter = 0;
        }
        await response.body?.cancel();
        throw new Error("Quota request failed");
      }
      const quota = parseCopilotQuota(await response.json());
      if (!current()) return;
      if (!quota || (quota.resetAt !== null && quota.resetAt <= this.now())) throw new Error("Quota unavailable");
      this.snapshot = { version: 1, fetchedAt: this.now(), quota };
      this.failures = 0;
      this.nextRefresh = this.now() + REFRESH_MS;
      this.publish({ status: "ready", quota });
      if (path) await this.writeCache(path, this.snapshot);
    } catch {
      if (!current()) return;
      this.failures++;
      this.nextRefresh = this.now() + Math.max(
        Math.min(REFRESH_MS * 2 ** Math.min(this.failures - 1, 4), MAX_AGE_MS),
        Math.min(Math.max(0, retryAfter), 60 * 60_000),
      );
      if (this.snapshot && this.usable(this.snapshot, this.now())) {
        this.publish({ status: "stale", quota: this.snapshot.quota });
      } else {
        this.snapshot = undefined;
        this.publish({ status: "unavailable" });
      }
    }
  }

  private async writeCache(path: string, snapshot: Snapshot): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.options.cacheDir!, { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
      await rename(temporary, path);
    } catch {} finally {
      await unlink(temporary).catch(() => {});
    }
  }
}
