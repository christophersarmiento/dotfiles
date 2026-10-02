import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface UsageRecord {
  key: string;
  week: string;
  cost: number;
}

interface SourceSnapshot {
  signature?: string;
  records: UsageRecord[];
}

const weekFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const weekdays: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function currentWeekKeyET(now: Date = new Date()): string {
  const parts = weekFormatter.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const sunday = new Date(Date.UTC(
    Number(part("year")), Number(part("month")) - 1,
    Number(part("day")) - weekdays[part("weekday")],
  ));
  return sunday.toISOString().slice(0, 10);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function usagePayload(entry: Record<string, unknown>): Record<string, unknown> | undefined {
  if (entry.type === "compaction" || entry.type === "branch_summary") return entry;
  if (entry.type !== "message") return undefined;
  const message = object(entry.message);
  return message?.role === "assistant" || message?.role === "toolResult" ? message : undefined;
}

function validCost(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function costOf(payload: Record<string, unknown>): number | undefined {
  const cost = object(object(payload.usage)?.cost)?.total;
  return validCost(cost) ? cost : undefined;
}

function timestampOf(value: unknown): number | undefined {
  const time = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) && Number.isFinite(new Date(time).getTime()) ? time : undefined;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sessionCost(entries: readonly unknown[]): number {
  let total = 0;
  for (const value of entries) {
    const entry = object(value);
    const payload = entry && usagePayload(entry);
    if (payload) total += costOf(payload) ?? 0;
  }
  return total;
}

export function usageRecords(entries: readonly unknown[]): UsageRecord[] {
  const records: UsageRecord[] = [];
  for (const value of entries) {
    const entry = object(value);
    const payload = entry && usagePayload(entry);
    if (!entry || !payload) continue;
    const cost = costOf(payload);
    const timestamp = timestampOf(payload.timestamp) ?? timestampOf(entry.timestamp);
    if (cost === undefined || timestamp === undefined) continue;
    const { usage: _usage, parentId: _parentId, ...legacyIdentity } = payload;
    const identity = [
      typeof entry.id === "string" ? entry.id : digest(JSON.stringify(legacyIdentity)),
      timestamp, entry.type, payload.role, payload.provider, payload.model, payload.toolCallId,
    ];
    records.push({ key: digest(JSON.stringify(identity)), week: currentWeekKeyET(new Date(timestamp)), cost });
  }
  return records;
}

function validRecord(value: unknown): value is UsageRecord {
  const record = object(value);
  return !!record && typeof record.key === "string" && /^[a-f0-9]{64}$/.test(record.key)
    && typeof record.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.week)
    && validCost(record.cost);
}

function missing(error: unknown): boolean {
  return object(error)?.code === "ENOENT";
}

async function signature(file: string): Promise<string> {
  const info = await stat(file);
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
}

export class WeeklyCostIndex {
  private readonly roots: string[];
  private readonly cacheDir?: string;
  private readonly sources = new Map<string, SourceSnapshot>();
  private pending?: Promise<void>;
  private complete = false;
  private cacheReady?: Promise<unknown>;

  constructor(options: { roots: string[]; cacheDir?: string }) {
    this.roots = [...new Set(options.roots.map((root) => resolve(root)))];
    this.cacheDir = options.cacheDir;
  }

  refresh(): Promise<void> {
    if (!this.pending) {
      this.pending = this.refreshSources().catch(() => {
        this.complete = false;
      }).finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  getTotal(now: Date, active?: { file?: string; records: UsageRecord[] }): { cost: number; complete: boolean } {
    const week = currentWeekKeyET(now);
    const costs = new Map<string, number>();
    const activeFile = active?.file ? resolve(active.file) : undefined;
    const add = (records: UsageRecord[]) => {
      for (const record of records) {
        if (record.week === week) costs.set(record.key, record.cost);
      }
    };
    for (const [file, snapshot] of this.sources) {
      if (file !== activeFile) add(snapshot.records);
    }
    if (active) add(active.records);
    return { cost: [...costs.values()].reduce((sum, cost) => sum + cost, 0), complete: this.complete };
  }

  private async refreshSources(): Promise<void> {
    const files = new Set<string>();
    const visited = new Set<string>();
    let complete = true;
    const visit = async (directory: string): Promise<void> => {
      if (visited.has(directory)) return;
      visited.add(directory);
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await visit(path);
          else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.add(path);
        }
      } catch (error) {
        if (!missing(error)) complete = false;
      }
    };
    for (const root of this.roots) await visit(root);
    if (complete) {
      for (const file of this.sources.keys()) {
        if (!files.has(file)) this.sources.delete(file);
      }
    }
    const queue = [...files];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (next < queue.length) {
        const file = queue[next++];
        if (!await this.refreshSource(file)) complete = false;
      }
    }));
    this.complete = complete;
  }

  private cachePath(file: string): string | undefined {
    return this.cacheDir ? join(this.cacheDir, `${digest(file)}.json`) : undefined;
  }

  private async readCache(file: string, currentSignature: string): Promise<SourceSnapshot | undefined> {
    const path = this.cachePath(file);
    if (!path) return undefined;
    try {
      const data = object(JSON.parse(await readFile(path, "utf8")));
      if (data?.version === 1 && data.source === file && data.signature === currentSignature
        && Array.isArray(data.records) && data.records.every(validRecord)) {
        return { signature: currentSignature, records: data.records };
      }
    } catch {}
    return undefined;
  }

  private async writeCache(file: string, snapshot: SourceSnapshot): Promise<void> {
    const path = this.cachePath(file);
    if (!path || !this.cacheDir) return;
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      this.cacheReady ??= mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
      await this.cacheReady;
      await writeFile(temporary, JSON.stringify({ version: 1, source: file, ...snapshot }), { mode: 0o600 });
      await rename(temporary, path);
    } catch {
      this.cacheReady = undefined;
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  private async refreshSource(file: string): Promise<boolean> {
    try {
      const before = await signature(file);
      if (this.sources.get(file)?.signature === before) return true;
      const cached = await this.readCache(file, before);
      if (cached) {
        this.sources.set(file, cached);
        return true;
      }
      const text = await readFile(file, "utf8");
      const entries: unknown[] = [];
      let complete = true;
      let headerSeen = false;
      let isSession = true;
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry: unknown = JSON.parse(line);
          if (!headerSeen) {
            if (object(entry)?.type !== "session") {
              isSession = false;
              break;
            }
            headerSeen = true;
          } else {
            entries.push(entry);
          }
        } catch {
          complete = false;
        }
      }
      const after = await signature(file);
      complete &&= before === after;
      const snapshot: SourceSnapshot = {
        signature: complete ? before : undefined,
        records: isSession ? usageRecords(entries) : [],
      };
      this.sources.set(file, snapshot);
      if (complete) await this.writeCache(file, snapshot);
      return complete;
    } catch (error) {
      if (missing(error)) this.sources.delete(file);
      return false;
    }
  }
}
