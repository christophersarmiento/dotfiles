type ShellCommand = { words: string[]; piped: boolean };

function shellCommands(source: string): ShellCommand[] {
	const commands: ShellCommand[] = [];
	let words: string[] = [];
	let word = "";
	let started = false;
	let quote = "";
	let piped = false;
	const flushWord = () => {
		if (started) words.push(word);
		word = "";
		started = false;
	};
	const flushCommand = () => {
		flushWord();
		if (words.length) commands.push({ words, piped });
		words = [];
	};
	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (ch === "\\" && quote !== "'" && i + 1 < source.length) {
			const next = source[i + 1];
			if (!quote || /["\\$`\n]/.test(next)) {
				i++;
				if (next !== "\n") { word += next; started = true; }
				continue;
			}
		}
		if (quote) {
			if (ch === quote) quote = "";
			else word += ch;
			continue;
		}
		if (ch === "'" || ch === '"') { quote = ch; started = true; continue; }
		if (ch === "#" && !started) {
			while (i < source.length && source[i] !== "\n") i++;
			flushCommand();
			piped = false;
		} else if (/[;|&()\n]/.test(ch)) {
			if (ch === "\n" && !started && words.length === 0 && piped) continue;
			flushCommand();
			piped = ch === "|" && source[i + 1] !== "|";
			if ((ch === "|" || ch === "&") && source[i + 1] === ch) i++;
		} else if (/\s/.test(ch)) {
			flushWord();
		} else {
			word += ch;
			started = true;
		}
	}
	flushCommand();
	return commands;
}

const executable = (word: string) => word.slice(word.lastIndexOf("/") + 1);
const assignment = (word: string) => /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(word);

function unwrap(words: string[]): string[] {
	let start = 0;
	while (assignment(words[start] ?? "")) start++;
	if (["env", "command", "exec", "nohup"].includes(executable(words[start] ?? ""))) {
		start++;
		while (assignment(words[start] ?? "")) start++;
		if (words[start] === "--") start++;
	}
	return words.slice(start);
}

function gitOperation(args: string[]): string[] {
	let i = 0;
	while (i < args.length && args[i].startsWith("-")) {
		if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(args[i])) i += 2;
		else if (/^(?:--(?:git-dir|work-tree|namespace|config-env)=|-[Cc].)/.test(args[i]) ||
			["--no-pager", "--paginate", "--bare", "--no-optional-locks"].includes(args[i])) i++;
		else return [];
	}
	return args.slice(i);
}

export function matchRisky(command: string, depth = 0): string | undefined {
	if (depth > 3) return undefined;
	let previousExecutable = "";
	for (const segment of shellCommands(command)) {
		const [program = "", ...args] = unwrap(segment.words);
		const name = executable(program);
		if (name === "sudo") return "sudo";
		const optionEnd = args.indexOf("--");
		const options = optionEnd < 0 ? args : args.slice(0, optionEnd);
		if (name === "rm") {
			const flags = options.filter((arg) => /^-[a-zA-Z]+$/.test(arg)).join("");
			if ((/[rR]/.test(flags) || options.includes("--recursive")) &&
				(flags.includes("f") || options.includes("--force"))) return "rm -rf";
		}
		if (name === "git") {
			const [operation, ...parameters] = gitOperation(args);
			const end = parameters.indexOf("--");
			const flags = end < 0 ? parameters : parameters.slice(0, end);
			if (operation === "push" && (flags.some((arg) => /^(?:--force(?:-with-lease(?:=.*)?)?|-\w*f\w*)$/.test(arg)) || parameters.some((arg) => arg.startsWith("+")))) {
				return "git push --force";
			}
			if (operation === "reset" && flags.includes("--hard")) return "git reset --hard";
		}
		if (["psql", "mysql", "mariadb", "sqlite3", "sqlcmd"].includes(name) && /\bdrop\s+(table|database)\b/i.test(args.join(" "))) {
			return "DROP TABLE/DATABASE";
		}
		if (["sh", "bash", "zsh", "dash", "ksh"].includes(name)) {
			if (segment.piped && ["curl", "wget"].includes(previousExecutable)) return "curl | sh";
			for (let i = 0; i < args.length && args[i].startsWith("-"); i++) {
				if (/^-[^-]*c/.test(args[i]) && args[i + 1]) {
					const nested = matchRisky(args[i + 1], depth + 1);
					if (nested) return nested;
					break;
				}
			}
		}
		if (name === "hypa") {
			const nested = matchRisky(args.filter((arg) => !["-c", "--raw"].includes(arg)).join(" "), depth + 1);
			if (nested) return nested;
		}
		previousExecutable = name;
	}
	return undefined;
}
