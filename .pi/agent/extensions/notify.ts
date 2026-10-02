import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";
import { matchRisky } from "./notify/risky.ts";
import { detectBackend, sanitizeText, sendNotification, type Backend } from "./notify/terminal.ts";

const SETTINGS_ENTRY = "terminal-notify-settings";
const DEFAULTS = { enabled: true, completion: true, prompts: true, risky: true, previews: false, cooldownMs: 5000 };
type Settings = typeof DEFAULTS;
type NotificationKind = "completion" | "prompts" | "risky" | "test";

export interface NotificationRuntime {
	env: NodeJS.ProcessEnv;
	isTTY: () => boolean;
	now: () => number;
	send: (backend: Backend, title: string, body: string) => Promise<void>;
}

function readSettings(data: unknown): Settings {
	const settings = { ...DEFAULTS };
	if (!data || typeof data !== "object") return settings;
	const source = data as Record<string, unknown>;
	for (const key of ["enabled", "completion", "prompts", "risky", "previews"] as const) {
		if (typeof source[key] === "boolean") settings[key] = source[key];
	}
	if (typeof source.cooldownMs === "number" && Number.isFinite(source.cooldownMs) && source.cooldownMs >= 0 && source.cooldownMs <= 3_600_000) {
		settings.cooldownMs = source.cooldownMs;
	}
	return settings;
}

function notificationTitle(ctx: ExtensionContext): string {
	const project = sanitizeText(basename(ctx.cwd), 32) || "project";
	const session = sanitizeText(ctx.sessionManager.getSessionName() || ctx.sessionManager.getSessionId().slice(0, 8), 48);
	return `Pi · ${project} · ${session}`;
}

const HELP = "/notify [status|test|on|off|reset|completion on/off|prompts on/off|risky on/off|previews on/off|cooldown <seconds>]";
const COMPLETIONS = ["status", "test", "on", "off", "reset", "completion on", "completion off", "prompts on", "prompts off", "risky on", "risky off", "previews on", "previews off", "cooldown 0", "cooldown 5", "cooldown 10"];

export default function (pi: ExtensionAPI, runtime: NotificationRuntime = {
	env: process.env,
	isTTY: () => process.stdout.isTTY === true,
	now: () => performance.now(),
	send: sendNotification,
}) {
	let settings = { ...DEFAULTS };
	let stopped = false;
	let running = false;
	let stopReason: string | undefined;
	let warned = false;
	let testTimer: ReturnType<typeof setTimeout> | undefined;
	const lastSent = new Map<NotificationKind, { body: string; at: number }>();
	const interactive = (ctx: ExtensionContext) => !stopped && ctx.mode === "tui" && runtime.isTTY();
	const cancelTest = () => {
		if (testTimer) clearTimeout(testTimer);
		testTimer = undefined;
	};
	const feedback = (ctx: ExtensionContext, text: string, type: "info" | "warning" = "info") => {
		if (!stopped && ctx.hasUI) {
			try { ctx.ui.notify(text, type); } catch {}
		}
	};
	const deliveryFailed = (ctx: ExtensionContext) => {
		if (warned || !interactive(ctx)) return;
		warned = true;
		feedback(ctx, "Notification delivery failed. Check /notify status and your terminal notification settings.", "warning");
	};
	const dispatch = (ctx: ExtensionContext, kind: NotificationKind, body: string) => {
		if (!interactive(ctx) || (kind !== "test" && (!settings.enabled || !settings[kind]))) return;
		const backend = detectBackend(runtime.env);
		if (!backend) return;
		const now = runtime.now();
		const previous = lastSent.get(kind);
		if (kind !== "test" && previous?.body === body && now - previous.at < settings.cooldownMs) return;
		lastSent.set(kind, { body, at: now });
		try {
			void runtime.send(backend, notificationTitle(ctx), body).catch(() => deliveryFailed(ctx));
		} catch {
			deliveryFailed(ctx);
		}
	};

	pi.on("session_start", (_event, ctx) => {
		cancelTest();
		stopped = false;
		running = false;
		stopReason = undefined;
		warned = false;
		lastSent.clear();
		settings = { ...DEFAULTS };
		if (!interactive(ctx)) return;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === SETTINGS_ENTRY) settings = readSettings(entry.data);
		}
	});
	pi.on("session_shutdown", () => {
		stopped = true;
		running = false;
		cancelTest();
		lastSent.clear();
	});
	pi.on("agent_start", () => {
		running = true;
		stopReason = undefined;
	});
	pi.on("message_end", (event) => {
		if (event.message.role === "assistant") stopReason = event.message.stopReason;
	});
	pi.on("agent_settled", (_event, ctx) => {
		if (!running || !ctx.isIdle()) return;
		running = false;
		if (stopReason === "aborted") return;
		const body = stopReason === "error" ? "Run failed — check Pi" :
			stopReason === "length" ? "Response limit reached — check Pi" : "Ready for input";
		dispatch(ctx, "completion", body);
	});
	pi.on("ui_prompt_start", (event, ctx) => {
		const body = event.kind === "confirm" ? "Confirmation required" :
			event.kind === "select" ? "Selection required" : "Input required";
		dispatch(ctx, "prompts", body);
	});
	pi.on("ui_prompt_end", () => { lastSent.delete("prompts"); });
	pi.on("tool_call", (event, ctx) => {
		if (!interactive(ctx) || !settings.enabled || !settings.risky) return;
		if (event.toolName !== "bash" && event.toolName !== "hypa_shell") return;
		const command: unknown = event.input.command;
		if (typeof command !== "string") return;
		const label = matchRisky(command);
		if (label) dispatch(ctx, "risky", settings.previews ? `${label}: ${sanitizeText(command, 120)}` : `Risky command: ${label}`);
	});

	pi.registerCommand("notify", {
		description: "Configure terminal notifications or send a delayed test",
		getArgumentCompletions: (prefix) => {
			const matches = COMPLETIONS.filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
			return matches.length ? matches : null;
		},
		handler: async (args, ctx) => {
			if (!interactive(ctx)) {
				feedback(ctx, "Terminal notifications require an interactive Pi TUI with a terminal stdout.", "warning");
				return;
			}
			const parts = args.trim().split(/\s+/);
			const [action = "", value] = parts;
			const backend = detectBackend(runtime.env);
			if (!action || (action === "status" && parts.length === 1)) {
				feedback(ctx, `Notifications ${settings.enabled ? "on" : "off"}; backend: ${backend ?? "unsupported terminal"}; completion: ${settings.completion}; prompts: ${settings.prompts}; risky: ${settings.risky}; previews: ${settings.previews}; cooldown: ${settings.cooldownMs / 1000}s. Settings are saved per session. ${HELP}`);
				return;
			}
			if (action === "test" && parts.length === 1) {
				if (!backend) {
					feedback(ctx, "No supported terminal detected. Use Ghostty, iTerm2, WezTerm, Kitty, or Windows Terminal.", "warning");
					return;
				}
				cancelTest();
				warned = false;
				feedback(ctx, "Test notification scheduled in 3 seconds. Switch away from this terminal; the test bypasses notification toggles and cooldown.");
				testTimer = setTimeout(() => {
					testTimer = undefined;
					dispatch(ctx, "test", "Test notification — Pi can request your attention");
				}, 3000);
				testTimer.unref();
				return;
			}
			let next = { ...settings };
			if (parts.length === 1 && (action === "on" || action === "off")) next.enabled = action === "on";
			else if (parts.length === 1 && action === "reset") next = { ...DEFAULTS };
			else if (parts.length === 2 && ["completion", "prompts", "risky", "previews"].includes(action) && (value === "on" || value === "off")) {
				next[action as "completion" | "prompts" | "risky" | "previews"] = value === "on";
			} else if (parts.length === 2 && action === "cooldown" && /^\d+(?:\.\d{1,3})?$/.test(value) && Number(value) <= 3600) {
				next.cooldownMs = Math.round(Number(value) * 1000);
			} else {
				feedback(ctx, `${HELP}. Cooldown must be between 0 and 3600 seconds.`, "warning");
				return;
			}
			try {
				pi.appendEntry(SETTINGS_ENTRY, next);
				settings = next;
				lastSent.clear();
				if (!settings.enabled) cancelTest();
				feedback(ctx, `Notification settings saved for this session: ${args.trim()}`);
			} catch {
				feedback(ctx, "Could not save notification settings; previous settings are unchanged.", "warning");
			}
		},
	});
}
