import { basename, join } from "node:path";
import { getAgentDir, readStoredCredential, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { sessionCost, usageRecords, WeeklyCostIndex, type UsageRecord } from "./statusbar/accounting.ts";
import { CodexQuotaClient } from "./statusbar/codex.ts";
import { AnthropicUsageClient } from "./statusbar/anthropic.ts";
import { CopilotQuotaClient } from "./statusbar/copilot.ts";
import { readGitStats } from "./statusbar/git.ts";
import { renderFooter } from "./statusbar/presentation.ts";
import { OpenRouterBalanceClient, resolveOpenRouterKey } from "./statusbar/openrouter.ts";

const GIT_REFRESH_MS = 3000;
const COST_REFRESH_MS = 5000;

export default function (pi: ExtensionAPI) {
  let dispose = () => {};
  let updateCurrent: (() => void) | undefined;
  let updateProvider: (() => void) | undefined;
  let nudgeUsage: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    dispose();
    if (ctx.mode !== "tui") return;

    const roots = [join(getAgentDir(), "sessions"), ctx.sessionManager.getSessionDir()];
    if (process.env.PI_CODING_AGENT_SESSION_DIR) roots.push(process.env.PI_CODING_AGENT_SESSION_DIR);
    const index = new WeeklyCostIndex({
      roots,
      cacheDir: join(getAgentDir(), "cache", "statusbar", "v1"),
    });
    let disposed = false;
    let requestRender = () => {};
    let unsubscribe = () => {};
    let gitStats: string | null = null;
    let gitPending: Promise<void> | undefined;
    let session = 0;
    let records: UsageRecord[] = [];
    let weekly = { cost: 0, complete: false };
    let entryCount = -1;
    let lastEntry: unknown;
    const sessionFile = ctx.sessionManager.getSessionFile();
    const copilot = new CopilotQuotaClient({
      getCredential: () => readStoredCredential("github-copilot"),
      onChange: () => requestRender(),
      cacheDir: join(getAgentDir(), "cache", "statusbar", "copilot-v1"),
    });
    const codex = new CodexQuotaClient({
      getCredential: () => readStoredCredential("openai-codex"),
      onChange: () => requestRender(),
    });
    const anthropic = new AnthropicUsageClient({
      isLoggedIn: () => {
        const credential = readStoredCredential("anthropic-omp");
        return credential?.type === "oauth" && credential.access === "omp-managed-oauth-v1";
      },
      request: signal => new Promise((resolve, reject) => {
        pi.events.emit("anthropic-omp:usage", {
          sessionId: ctx.sessionManager.getSessionId(), signal, resolve, reject,
        });
      }),
      onChange: () => requestRender(),
    });
    const openrouter = new OpenRouterBalanceClient({
      getKey: () => resolveOpenRouterKey(async () =>
        (await ctx.modelRegistry.getProviderAuth("openrouter"))?.auth.apiKey),
      onChange: () => requestRender(),
    });
    nudgeUsage = () => {
      if (disposed) return;
      anthropic.nudge();
      updateProvider?.();
    };
    updateProvider = () => {
      if (disposed) return;
      void copilot.refresh(ctx.model?.provider);
      void codex.refresh(ctx.model?.provider);
      void anthropic.refresh(ctx.model?.provider);
      void openrouter.refresh(ctx.model?.provider);
      requestRender();
    };

    const updateTotal = () => {
      weekly = index.getTotal(new Date(), { file: sessionFile, records });
      requestRender();
    };
    updateCurrent = () => {
      if (disposed) return;
      const entries = ctx.sessionManager.getEntries();
      if (entries.length !== entryCount || entries.at(-1) !== lastEntry) {
        session = sessionCost(entries);
        records = usageRecords(entries);
        entryCount = entries.length;
        lastEntry = entries.at(-1);
      }
      updateTotal();
    };
    const refreshCosts = async () => {
      if (disposed) return;
      updateCurrent?.();
      updateProvider?.();
      await index.refresh();
      if (!disposed) updateTotal();
    };
    const refreshGit = () => {
      if (disposed || gitPending) return;
      gitPending = readGitStats(ctx.cwd).then((next) => {
        if (!disposed && gitStats !== next) {
          gitStats = next;
          requestRender();
        }
      }).finally(() => {
        gitPending = undefined;
      });
    };

    const costTimer = setInterval(() => { void refreshCosts(); }, COST_REFRESH_MS);
    const gitTimer = setInterval(refreshGit, GIT_REFRESH_MS);
    costTimer.unref();
    gitTimer.unref();
    dispose = () => {
      if (disposed) return;
      disposed = true;
      clearInterval(costTimer);
      clearInterval(gitTimer);
      copilot.dispose();
      codex.dispose();
      anthropic.dispose();
      openrouter.dispose();
      unsubscribe();
      requestRender = () => {};
      updateCurrent = undefined;
      updateProvider = undefined;
      nudgeUsage = undefined;
    };

    updateCurrent();
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      unsubscribe = footerData.onBranchChange(() => {
        refreshGit();
        requestRender();
      });
      return {
        dispose,
        invalidate() {},
        render(width: number): string[] {
          const usage = ctx.getContextUsage();
          const level = pi.getThinkingLevel();
          return renderFooter({
            model: ctx.model?.name ?? ctx.model?.id ?? "no-model",
            provider: ctx.model?.provider,
            copilot: copilot.getState(),
            codex: codex.getState(),
            anthropic: anthropic.getState(),
            openrouter: openrouter.getState(),
            directory: basename(ctx.cwd) || ctx.cwd,
            branch: footerData.getGitBranch(),
            gitStats,
            tokens: usage?.tokens ?? null,
            contextWindow: usage?.contextWindow ?? ctx.model?.contextWindow ?? null,
            percent: usage?.percent ?? null,
            effort: level,
            styleEffort: theme.getThinkingBorderColor(level),
            session,
            weekly,
            statuses: [...footerData.getExtensionStatuses()]
              .filter(([key]) => key !== "mcp")
              .map(([, status]) => status),
          }, width);
        },
      };
    });
    void refreshCosts();
    refreshGit();
  });

  pi.on("model_select", () => { updateProvider?.(); });
  pi.on("tool_call", () => { updateCurrent?.(); });
  pi.on("turn_end", () => { updateCurrent?.(); });
  pi.on("agent_end", () => { updateCurrent?.(); nudgeUsage?.(); });
  pi.on("session_compact", () => { updateCurrent?.(); });
  pi.on("session_tree", () => { updateCurrent?.(); });
  pi.on("session_shutdown", () => { dispose(); });
}
