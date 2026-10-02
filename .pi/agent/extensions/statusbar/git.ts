import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readGitStats(cwd: string): Promise<string | null> {
  const options = { cwd, timeout: 1500, maxBuffer: 1024 * 1024 };
  try {
    const flags = ["--no-ext-diff", "--no-textconv", "--numstat"];
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync("git", ["diff", ...flags, "HEAD", "--"], options));
    } catch (error) {
      if ((error as { code?: number }).code !== 128) return null;
      const emptyTree = execFileAsync("git", ["hash-object", "-t", "tree", "--stdin"], options);
      emptyTree.child.stdin?.end();
      const tree = (await emptyTree).stdout.trim();
      ({ stdout } = await execFileAsync("git", ["diff", ...flags, tree, "--"], options));
    }
    let added = 0;
    let removed = 0;
    for (const line of stdout.split("\n")) {
      const match = line.match(/^(\d+)\s+(\d+)\s/);
      if (!match) continue;
      added += Number(match[1]);
      removed += Number(match[2]);
    }
    return added || removed ? `+${added} -${removed}` : null;
  } catch {
    return null;
  }
}
