import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Registers `/clear` as an alias for `/new` — starts a new session,
 * matching the Claude Code muscle memory.
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("clear", {
    description: "Start a new session (alias for /new)",
    handler: async (_args, ctx) => {
      await ctx.newSession();
    },
  });
}
