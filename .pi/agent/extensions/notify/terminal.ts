import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeSync } from "node:fs";

export type Backend = "osc777" | "osc9" | "osc99" | "windows";

export function detectBackend(env: NodeJS.ProcessEnv): Backend | undefined {
	if (env.TERM_PROGRAM === "ghostty" || env.TERM_PROGRAM === "WezTerm") return "osc777";
	if (env.TERM_PROGRAM === "iTerm.app") return "osc9";
	if (env.KITTY_WINDOW_ID || env.TERM === "xterm-kitty") return "osc99";
	if (env.WT_SESSION) return "windows";
	return undefined;
}

export function sanitizeText(text: string, max = 160): string {
	const clean = text.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "").trim();
	const characters = Array.from(clean);
	return characters.length > max ? `${characters.slice(0, max - 1).join("")}…` : clean;
}

export function terminalSequence(backend: Exclude<Backend, "windows">, title: string, body: string, id: string = randomUUID()): string {
	const safeTitle = sanitizeText(title, 96);
	const safeBody = sanitizeText(body);
	if (backend === "osc9") return `\x1b]9;${safeTitle}: ${safeBody}\x07`;
	if (backend === "osc777") return `\x1b]777;notify;${safeTitle.replaceAll(";", ",")};${safeBody}\x07`;
	const safeId = id.replace(/[^a-zA-Z0-9_+.-]/g, "");
	return `\x1b]99;i=${safeId}:d=0;${safeTitle}\x1b\\\x1b]99;i=${safeId}:p=body;${safeBody}\x1b\\`;
}

export function windowsToastScript(title: string, body: string): string {
	const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
	const type = "Windows.UI.Notifications";
	return [
		"$ErrorActionPreference = 'Stop'",
		`[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime] > $null`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent([${type}.ToastTemplateType]::ToastText02)`,
		`$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode(${quote(sanitizeText(title, 96))})) > $null`,
		`$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode(${quote(sanitizeText(body))})) > $null`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier('Microsoft.WindowsPowerShell').Show([${type}.ToastNotification]::new($xml))`,
	].join("; ");
}

export async function sendNotification(backend: Backend, title: string, body: string): Promise<void> {
	if (backend === "windows") {
		await new Promise<void>((resolve, reject) => {
			execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsToastScript(title, body)],
				{ timeout: 5000, windowsHide: true, maxBuffer: 64 * 1024 },
				(error) => error ? reject(error) : resolve());
		});
		return;
	}
	writeSync(process.stdout.fd, terminalSequence(backend, title, body));
}
